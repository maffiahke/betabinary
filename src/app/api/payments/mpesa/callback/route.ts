import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkStkStatus } from "@/lib/mpesa";

/* ------------------------------------------------------------------ */
/*  Safaricom Daraja callback body types                               */
/* ------------------------------------------------------------------ */

interface DarajaCallbackItem {
  Name: string;
  Value: string | number;
}

interface DarajaStkCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: {
    Item: DarajaCallbackItem[];
  };
}

interface DarajaCallbackBody {
  Body: {
    stkCallback: DarajaStkCallback;
  };
}

/* ------------------------------------------------------------------ */
/*  Webhook handler                                                    */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const rawBody = await req.text();

  let body: DarajaCallbackBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callback = body.Body?.stkCallback;
  if (!callback) {
    console.warn("Daraja callback: missing Body.stkCallback", rawBody.slice(0, 500));
    return NextResponse.json({ error: "Invalid callback structure" }, { status: 400 });
  }

  const { CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

  // ResultCode 0 means the payment was successful at Safaricom's side.
  // Any other ResultCode is a terminal failure for this attempt.

  // Find the pending transaction using the CheckoutRequestID which we stored
  // in the transaction metadata during initiateStkPush.
  const allPending = await prisma.transaction.findMany({
    where: { method: "mpesa", status: "pending" },
    select: { id: true, metadata: true, externalRef: true, amount: true, userId: true },
  });

  const match = allPending.find((t) => {
    if (!t.metadata) return false;
    try {
      const meta = JSON.parse(t.metadata);
      return meta.checkoutRequestId === CheckoutRequestID;
    } catch {
      return false;
    }
  });

  if (!match) {
    console.warn(
      `Daraja callback: no pending mpesa transaction found for CheckoutRequestID ${CheckoutRequestID}`
    );
    // Acknowledge receipt so Safaricom doesn't retry
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const existingMeta = match.metadata ? JSON.parse(match.metadata) : {};

  if (ResultCode === 0 && CallbackMetadata?.Item) {
    // Extract values from the callback metadata
    const metaMap = new Map<string, string | number>();
    for (const item of CallbackMetadata.Item) {
      metaMap.set(item.Name, item.Value);
    }

    const mpesaReceipt = String(metaMap.get("MpesaReceiptNumber") || "");
    const paidAmount = Number(metaMap.get("Amount") || 0);

    // Corroborate with Daraja's query API as a safety check
    let corroborated = false;
    try {
      const statusResult = await checkStkStatus(CheckoutRequestID);
      console.log(
        `[mpesa-callback] corroboration for ${CheckoutRequestID}:`,
        JSON.stringify(statusResult)
      );
      corroborated = statusResult.data?.response?.Status === "Success";
    } catch (err) {
      console.error(`Daraja callback: corroboration query failed for ${CheckoutRequestID}`, err);
    }

    if (!corroborated) {
      console.warn(
        `Daraja callback: uncorroborated success for CheckoutRequestID=${CheckoutRequestID} ` +
          "— proceeding because the callback payload itself indicates success."
      );
    }

    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: match.id },
        data: {
          status: "completed",
          externalRef: mpesaReceipt || match.externalRef,
          metadata: JSON.stringify({
            ...existingMeta,
            mpesaReceipt,
            paidAmount,
            checkoutRequestId: CheckoutRequestID,
            merchantRequestId: MerchantRequestID,
            resolvedVia: corroborated ? "webhook-corroborated" : "webhook-uncorroborated",
            callbackResultDesc: ResultDesc,
          }),
        },
      }),
      prisma.user.update({
        where: { id: match.userId },
        data: { balance: { increment: match.amount } },
      }),
    ]);

    console.log(
      `Deposit completed: ${match.externalRef || CheckoutRequestID} ` +
        `(+$${match.amount} for user ${match.userId})`
    );
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Success" });
  }

  // Transaction failed at Safaricom
  const failureReason = ResultDesc || "Payment failed";

  await prisma.transaction.update({
    where: { id: match.id },
    data: {
      status: "failed",
      metadata: JSON.stringify({
        ...existingMeta,
        failureReason,
        checkoutRequestId: CheckoutRequestID,
        merchantRequestId: MerchantRequestID,
        resultCode: ResultCode,
      }),
    },
  });

  console.log(`Deposit failed: ${CheckoutRequestID} (${failureReason})`);
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Success" });
}
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { SessionProvider } from "@/components/providers/SessionProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BetaaBinary - Binary Trading Platform",
  description: "Trade binary options on synthetic indices",
};

export const viewport: Viewport = {
  themeColor: "#833ab4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <SessionProvider>{children}</SessionProvider>
        <Script id="tawk-to" strategy="afterInteractive">
          {`
            var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
            // Lift the chat bubble above the app's fixed bottom trading nav
            // (nav is 72px + iOS safe-area) so it never blocks nav taps.
            Tawk_API.onLoad = function(){
              var el = document.querySelector('iframe[src*="tawk.to"]');
              while (el && el !== document.body) {
                if (getComputedStyle(el).position === 'fixed') {
                  el.style.bottom = 'calc(76px + env(safe-area-inset-bottom, 0px))';
                  break;
                }
                el = el.parentElement;
              }
            };
            (function(){
            var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
            s1.async=true;
            s1.src='https://embed.tawk.to/6a84487fbc557a344a5e27ab/default';
            s1.charset='UTF-8';
            s1.setAttribute('crossorigin','*');
            s0.parentNode.insertBefore(s1,s0);
            })();
          `}
        </Script>
         
   </body>
    </html>
  );
}

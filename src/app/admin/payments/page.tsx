"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  ToggleLeft,
  ToggleRight,
  Save,
  Settings,
  X,
  Eye,
  EyeOff,
  Smartphone,
  Wallet,
} from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  label: string;
  enabled: boolean;
  config: string;
}

interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  tillNumber: string;
  transactionType: string;
  callbackUrl: string;
  mpesaEnv: string;
}

const defaultDarajaConfig: DarajaConfig = {
  consumerKey: "",
  consumerSecret: "",
  passkey: "",
  shortcode: "",
  tillNumber: "",
  transactionType: "CustomerPayBillOnline",
  callbackUrl: "",
  mpesaEnv: "sandbox",
};

function parseConfig(raw: string): DarajaConfig {
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultDarajaConfig, ...parsed };
  } catch {
    return { ...defaultDarajaConfig };
  }
}

export default function AdminPaymentsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [editForm, setEditForm] = useState({ label: "", enabled: true, config: "{}" });
  const [darajaForm, setDarajaForm] = useState<DarajaConfig>({ ...defaultDarajaConfig });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMethods = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/payments");
    const data = await res.json();
    setMethods(data.methods);
    setLoading(false);
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  const showMsg = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 3000);
  };

  const toggleSecret = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleToggle = async (m: PaymentMethod) => {
    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, enabled: !m.enabled }),
    });
    if (res.ok) {
      showMsg(`${m.label} ${m.enabled ? "disabled" : "enabled"}`);
      fetchMethods();
    }
  };

  const handleConfigure = (m: PaymentMethod) => {
    setEditing(m);
    setEditForm({ label: m.label, enabled: m.enabled, config: m.config });
    if (m.name === "mpesa") {
      setDarajaForm(parseConfig(m.config));
    }
    setShowSecrets({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    let configToSave: Record<string, unknown>;
    if (editing.name === "mpesa") {
      configToSave = darajaForm as unknown as Record<string, unknown>;
    } else {
      try {
        configToSave = JSON.parse(editForm.config);
      } catch {
        configToSave = {};
      }
    }

    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, label: editForm.label, config: configToSave }),
    });

    setSaving(false);
    if (res.ok) {
      setEditing(null);
      showMsg(`${editing.label} credentials updated`);
      fetchMethods();
    } else {
      showMsg("Failed to update — check your input");
    }
  };

  const renderSecretField = (
    label: string,
    field: keyof DarajaConfig,
    placeholder: string
  ) => {
    const isVisible = showSecrets[field];
    return (
      <div>
        <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
          {label}
        </label>
        <div className="relative">
          <input
            type={isVisible ? "text" : "password"}
            value={darajaForm[field]}
            onChange={(e) =>
              setDarajaForm({ ...darajaForm, [field]: e.target.value })
            }
            placeholder={placeholder}
            className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white outline-none focus:border-[#833ab4]/50 font-mono"
          />
          <button
            type="button"
            onClick={() => toggleSecret(field)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {isVisible ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-[#833ab4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Payment Methods</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage deposit/withdrawal payment methods and gateway credentials
        </p>
      </div>

      {msg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 text-sm text-emerald-400">
          {msg}
        </div>
      )}

      <div className="grid gap-4">
        {methods.map((m) => (
          <div
            key={m.id}
            className="bg-[#0d0f17] border border-white/[0.07] rounded-2xl p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#833ab4]/15 border border-[#833ab4]/25 flex items-center justify-center">
                  {m.name === "mpesa" ? (
                    <Smartphone className="w-5 h-5 text-[#833ab4]" />
                  ) : m.name === "usdt" ? (
                    <Wallet className="w-5 h-5 text-[#833ab4]" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-[#833ab4]" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{m.label}</p>
                  <p className="text-xs text-gray-500 capitalize">{m.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(m)}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-400"
                  title={m.enabled ? "Disable" : "Enable"}
                >
                  {m.enabled ? (
                    <ToggleRight className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-500" />
                  )}
                </button>
                <button
                  onClick={() => handleConfigure(m)}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"
                  title="Configure"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-lg ${
                    m.enabled
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {m.enabled ? "Active" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-[#0d0f17] border border-white/[0.07] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4" /> Configure {editing.label}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="p-1 rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                  Label
                </label>
                <input
                  value={editForm.label}
                  onChange={(e) =>
                    setEditForm({ ...editForm, label: e.target.value })
                  }
                  className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50"
                />
              </div>

              {editing.name === "mpesa" && (
                <>
                  <div className="border-t border-white/[0.05] pt-4 mt-4">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-[#833ab4]" />
                      Daraja STK Credentials
                    </h3>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                      Environment
                    </label>
                    <select
                      value={darajaForm.mpesaEnv}
                      onChange={(e) =>
                        setDarajaForm({
                          ...darajaForm,
                          mpesaEnv: e.target.value,
                        })
                      }
                      className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50"
                    >
                      <option value="sandbox">Sandbox (Testing)</option>
                      <option value="production">Production (Live)</option>
                    </select>
                  </div>

                  {renderSecretField(
                    "Consumer Key",
                    "consumerKey",
                    "e.g. abc123..."
                  )}
                  {renderSecretField(
                    "Consumer Secret",
                    "consumerSecret",
                    "e.g. xyz789..."
                  )}
                  {renderSecretField("Passkey", "passkey", "Daraja passkey")}

                  <div>
                    <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                      Shortcode
                    </label>
                    <input
                      value={darajaForm.shortcode}
                      onChange={(e) =>
                        setDarajaForm({
                          ...darajaForm,
                          shortcode: e.target.value,
                        })
                      }
                      placeholder="Paybill / Head-office shortcode"
                      className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                      Transaction Type
                    </label>
                    <select
                      value={darajaForm.transactionType}
                      onChange={(e) =>
                        setDarajaForm({
                          ...darajaForm,
                          transactionType: e.target.value,
                        })
                      }
                      className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50"
                    >
                      <option value="CustomerPayBillOnline">
                        CustomerPayBillOnline (Paybill)
                      </option>
                      <option value="CustomerBuyGoodsOnline">
                        CustomerBuyGoodsOnline (Till)
                      </option>
                    </select>
                  </div>

                  {darajaForm.transactionType ===
                    "CustomerBuyGoodsOnline" && (
                    <div>
                      <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                        Till Number
                      </label>
                      <input
                        value={darajaForm.tillNumber}
                        onChange={(e) =>
                          setDarajaForm({
                            ...darajaForm,
                            tillNumber: e.target.value,
                          })
                        }
                        placeholder="Required for Buy Goods"
                        className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50 font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                      Callback URL
                    </label>
                    <input
                      value={darajaForm.callbackUrl}
                      onChange={(e) =>
                        setDarajaForm({
                          ...darajaForm,
                          callbackUrl: e.target.value,
                        })
                      }
                      placeholder="https://yourdomain.com/api/payments/mpesa/callback"
                      className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50 font-mono"
                    />
                    <p className="text-[11px] text-gray-600 mt-1">
                      Safaricom will POST STK push results to this URL
                    </p>
                  </div>
                </>
              )}

              {editing.name !== "mpesa" && (
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1.5 block">
                    Configuration (JSON)
                  </label>
                  <textarea
                    value={editForm.config}
                    onChange={(e) =>
                      setEditForm({ ...editForm, config: e.target.value })
                    }
                    rows={5}
                    className="w-full bg-[#141822] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#833ab4]/50 font-mono"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 rounded-xl bg-gradient-brand text-white text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Changes
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";

type Currency = "USD" | "KHR";
type Period = "day" | "week" | "month";
export type TrackerRoute = "analyze" | "add" | "account";
type Expense = {
  id: string;
  category: string;
  amountMinor: number;
  currency: Currency;
  date: string;
  note: string;
};

const STORE_KEY = "moneyguard.expenses.v2";
const LEGACY_STORE_KEY = "moneyguard.expenses.v1";
const EDIT_DRAFT_KEY = "moneyguard.edit-draft.v1";
const CURRENCY_KEY = "moneyguard.currency.v1";
const categories = [
  { name: "Food", color: "#dce9bd", icon: "◒" },
  { name: "Transport", color: "#c8f36b", icon: "↗" },
  { name: "Bills", color: "#68bb9c", icon: "▤" },
  { name: "Shopping", color: "#95c94c", icon: "◇" },
  { name: "Health", color: "#e1bd63", icon: "+" },
  { name: "Other", color: "#7c8971", icon: "•••" },
];
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
});

const expenseSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["Food", "Transport", "Bills", "Shopping", "Health", "Other"]),
  amountMinor: z.number().int().positive().safe(),
  currency: z.enum(["USD", "KHR"]),
  date: localDateSchema,
  note: z.string().max(140),
});
const expenseListSchema = z.array(expenseSchema);
const legacyExpenseListSchema = z.array(
  z.object({
    id: z.string().min(1),
    category: z.enum(["Food", "Transport", "Bills", "Shopping", "Health", "Other"]),
    amount: z.number().positive().finite(),
    currency: z.enum(["USD", "KHR"]),
    date: localDateSchema,
    note: z.string().max(140),
  }),
);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateAtMidnight = (value: string) => new Date(`${value}T00:00:00`);
const amountToMinor = (value: string, currency: Currency) => {
  const raw = value.replaceAll(",", "").trim();
  if (currency === "KHR") return Number(raw);
  const [whole, fraction = ""] = raw.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
};
const amountToMajor = (amountMinor: number, currency: Currency) =>
  currency === "USD" ? amountMinor / 100 : amountMinor;
const money = (value: number, currency: Currency, compact = false) => {
  if (currency === "KHR")
    return `៛${Math.round(value).toLocaleString("en-US")}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(value);
};

function Icon({
  name,
}: {
  name: "chart" | "plus" | "user" | "arrow" | "check";
}) {
  const paths = {
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h17" />
        <path d="m7 15 4-4 3 2 6-7" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function TrackerApp({ route }: { route: TrackerRoute }) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("week");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let storedExpenses: Expense[] = [];
    let storedCurrency: Currency | null = null;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        const parsed = expenseListSchema.safeParse(JSON.parse(saved));
        if (parsed.success) storedExpenses = parsed.data;
      } else {
        const legacy = localStorage.getItem(LEGACY_STORE_KEY);
        if (legacy) {
          const parsed = legacyExpenseListSchema.safeParse(JSON.parse(legacy));
          if (parsed.success) {
            storedExpenses = parsed.data.map(({ amount, currency: itemCurrency, ...expense }) => ({
              ...expense,
              amountMinor: Math.round(amount * (itemCurrency === "USD" ? 100 : 1)),
              currency: itemCurrency,
            }));
          }
        }
      }
      const last = localStorage.getItem(CURRENCY_KEY);
      if (last === "USD" || last === "KHR") storedCurrency = last;
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    queueMicrotask(() => {
      setExpenses(storedExpenses);
      if (storedCurrency) setCurrency(storedCurrency);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (route !== "add") return;
    try {
      const rawDraft = sessionStorage.getItem(EDIT_DRAFT_KEY);
      if (!rawDraft) return;
      const parsed = expenseSchema.safeParse(JSON.parse(rawDraft));
      if (!parsed.success) {
        sessionStorage.removeItem(EDIT_DRAFT_KEY);
        return;
      }
      const draft = parsed.data;
      queueMicrotask(() => {
        setEditingId(draft.id);
        setCategory(draft.category);
        setAmount(String(amountToMajor(draft.amountMinor, draft.currency)));
        setDate(draft.date);
        setNote(draft.note);
        setCurrency(draft.currency);
      });
    } catch {
      sessionStorage.removeItem(EDIT_DRAFT_KEY);
    }
  }, [route]);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(expenses));
      } catch {
        /* Keep the session usable without storage. */
      }
    }
  }, [expenses, ready]);

  const bucketBoundaries = useMemo(() => makeBuckets([], period), [period]);
  const visibleExpenses = useMemo(() => {
    const now = dateAtMidnight(today());
    const start = bucketBoundaries[0].start;
    return expenses.filter(
      (expense) =>
        expense.currency === currency &&
        dateAtMidnight(expense.date) >= start &&
        dateAtMidnight(expense.date) <= now,
    );
  }, [expenses, bucketBoundaries, currency]);

  const total = visibleExpenses.reduce(
    (sum, expense) => sum + expense.amountMinor,
    0,
  );
  const categoryTotals = categories
    .map((item) => ({
      ...item,
      amount: visibleExpenses
        .filter((expense) => expense.category === item.name)
        .reduce((sum, expense) => sum + expense.amountMinor, 0),
    }))
    .filter((item) => item.amount > 0);
  const buckets = useMemo(
    () => makeBuckets(visibleExpenses, period),
    [visibleExpenses, period],
  );
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.amount));
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  function chooseCurrency(next: Currency) {
    setCurrency(next);
    try {
      localStorage.setItem(CURRENCY_KEY, next);
    } catch {
      /* Preference remains in memory. */
    }
  }

  function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessageIsSuccess(false);
    const raw = amount.replaceAll(",", "").trim();
    if (!category) {
      setMessage("Choose a category to continue.");
      return;
    }
    if (
      (currency === "USD" && !/^\d+(\.\d{1,2})?$/.test(raw)) ||
      (currency === "KHR" && !/^\d+$/.test(raw))
    ) {
      setMessage(
        currency === "USD"
          ? "USD allows up to 2 decimal places."
          : "Riel amounts must be whole numbers.",
      );
      return;
    }
    const valueMinor = amountToMinor(raw, currency);
    if (!Number.isSafeInteger(valueMinor) || valueMinor <= 0) {
      setMessage("Enter an amount greater than zero.");
      return;
    }
    if (!date || Number.isNaN(dateAtMidnight(date).getTime())) {
      setMessage("Choose a valid date.");
      return;
    }
    const entry = {
      id: editingId ?? crypto.randomUUID(),
      category,
      amountMinor: valueMinor,
      currency,
      date,
      note: note.trim(),
    };
    setExpenses((current) =>
      editingId
        ? current.map((expense) => (expense.id === editingId ? entry : expense))
        : [entry, ...current],
    );
    setAmount("");
    setNote("");
    setCategory("");
    setDate(today());
    setEditingId(null);
    sessionStorage.removeItem(EDIT_DRAFT_KEY);
    setMessage(
      editingId
        ? "Expense updated on this device."
        : "Expense saved on this device.",
    );
    setMessageIsSuccess(true);
    window.setTimeout(() => setMessage(""), 2600);
  }

  function deleteExpense(expense: Expense) {
    if (!window.confirm(`Delete this ${expense.category} expense?`)) return;
    setExpenses((current) => current.filter((item) => item.id !== expense.id));
  }

  function editExpense(expense: Expense) {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify(expense));
    setMessage("");
    setMessageIsSuccess(false);
    router.push("/add");
  }

  function startNewExpense() {
    sessionStorage.removeItem(EDIT_DRAFT_KEY);
    setEditingId(null);
    setCategory("");
    setAmount("");
    setDate(today());
    setNote("");
    setMessage("");
    setMessageIsSuccess(false);
    router.push("/add");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => router.push("/analyze")}
          aria-label="MoneyGuard home"
        >
          <span className="brand-mark">
            <span>+</span>
          </span>
          <span>MoneyGuard</span>
        </button>
        <div className="topbar-right">
          <span className="local-badge">
            <i /> On this device
          </span>
          <button
            className="avatar"
            onClick={() => router.push("/account")}
            aria-label="Open account"
          >
            <Icon name="user" />
          </button>
        </div>
      </header>

      <main className="main-content">
        {route === "analyze" && (
          <>
            <section className="welcome-row">
              <div>
                <p className="eyebrow">YOUR MONEY, IN FOCUS</p>
                <h1>
                  Good day<span className="lime">.</span>
                </h1>
                <p className="subhead">A clearer picture of where it goes.</p>
              </div>
              <button
                className="primary-button desktop-add"
                onClick={startNewExpense}
              >
                <Icon name="plus" /> Add expense
              </button>
            </section>

            <section className="overview-card">
              <div className="overview-top">
                <div>
                  <p className="eyebrow">SPENDING OVERVIEW</p>
                  <h2>{periodLabel(period)}</h2>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Choose time period"
                >
                  {(["day", "week", "month"] as Period[]).map((item) => (
                    <button
                      key={item}
                      className={period === item ? "selected" : ""}
                      onClick={() => setPeriod(item)}
                    >
                      {item === "day"
                        ? "Daily"
                        : item === "week"
                          ? "Weekly"
                          : "Monthly"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overview-total">
                <div>
                  <span className="total-label">
                    Total in{" "}
                    {currency === "USD" ? "US dollars" : "Cambodian riel"}
                  </span>
              <strong>{money(amountToMajor(total, currency), currency)}</strong>
                </div>
                <div
                  className="currency-switch"
                  role="group"
                  aria-label="Choose currency"
                >
                  <button
                    className={currency === "USD" ? "selected" : ""}
                    onClick={() => chooseCurrency("USD")}
                  >
                    $ USD
                  </button>
                  <button
                    className={currency === "KHR" ? "selected" : ""}
                    onClick={() => chooseCurrency("KHR")}
                  >
                    ៛ KHR
                  </button>
                </div>
              </div>
              <p className="currency-note">
                USD and KHR are tracked separately. No conversion applied.
              </p>
            </section>

            <section className="charts-grid" aria-label="Spending charts">
              <article className="surface chart-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">SPENDING TREND</p>
                    <h3>
                      Across{" "}
                      {period === "day"
                        ? "the last 7 days"
                        : period === "week"
                          ? "the last 6 weeks"
                          : "the last 6 months"}
                    </h3>
                  </div>
                  <span className="chart-badge">
                    <span /> {currency}
                  </span>
                </div>
                {visibleExpenses.length ? (
                  <div
                    className="bar-chart"
                    role="img"
                    aria-label="Bar chart of spending by period"
                  >
                    {buckets.map((bucket) => (
                      <div className="bar-column" key={bucket.label}>
                        <span className="bar-value">
                          {bucket.amount
                            ? compactMoney(bucket.amount, currency)
                            : ""}
                        </span>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              height: `${Math.max(bucket.amount ? 10 : 0, (bucket.amount / maxBucket) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="bar-label">{bucket.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyChart text="Your spending trend will show here." />
                )}
              </article>
              <article className="surface chart-card category-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">YOUR HABITS</p>
                    <h3>By category</h3>
                  </div>
                  <span className="dots-menu" aria-hidden="true">
                    ···
                  </span>
                </div>
                {categoryTotals.length ? (
                  <div className="donut-layout">
                    <Donut
                      items={categoryTotals}
                      total={total}
                      currency={currency}
                    />
                    <div className="legend">
                      {categoryTotals.map((item) => (
                        <div className="legend-row" key={item.name}>
                          <i style={{ background: item.color }} />
                          <span>{item.name}</span>
                          <b>{money(amountToMajor(item.amount, currency), currency, true)}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyChart text="Your category breakdown will show here." />
                )}
              </article>
            </section>

            <section className="surface recent-card">
              <div className="recent-heading">
                <div>
                  <p className="eyebrow">LATEST ACTIVITY</p>
                  <h3>Recent expenses</h3>
                </div>
                <button className="text-button" onClick={startNewExpense}>
                  Add new <Icon name="arrow" />
                </button>
              </div>
              {recent.length ? (
                <div className="expense-list">
                  {recent.map((expense) => (
                    <ExpenseRow
                      expense={expense}
                      key={expense.id}
                      onEdit={() => editExpense(expense)}
                      onDelete={() => deleteExpense(expense)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-recent">
                  <span className="empty-icon">
                    <Icon name="chart" />
                  </span>
                  <div>
                    <b>No expenses yet</b>
                    <p>
                      Add your first expense to start seeing your spending
                      patterns.
                    </p>
                  </div>
                  <button className="outline-button" onClick={startNewExpense}>
                    Add an expense <Icon name="arrow" />
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {route === "add" && (
          <section className="form-page">
            <Link className="back-link" href="/analyze" onClick={() => {
              setMessage("");
              setEditingId(null);
              sessionStorage.removeItem(EDIT_DRAFT_KEY);
            }}>
              ← <span>Back to overview</span>
            </Link>
            <div className="form-intro">
              <p className="eyebrow">KEEP TRACK AS YOU GO</p>
              <h1>
                {editingId ? "Edit expense" : "Add an expense"}
                <span className="lime">.</span>
              </h1>
              <p className="subhead">
                A few details now make your spending clearer later.
              </p>
            </div>
            <form className="surface expense-form" onSubmit={saveExpense}>
              <fieldset>
                <legend>What was it for?</legend>
                <div className="category-grid">
                  {categories.map((item) => (
                    <button
                      type="button"
                      key={item.name}
                      className={`category-option ${category === item.name ? "active" : ""}`}
                      onClick={() => {
                        setCategory(item.name);
                        setMessage("");
                        setMessageIsSuccess(false);
                      }}
                      aria-pressed={category === item.name}
                    >
                      <span
                        className="category-icon"
                        style={
                          { "--category-color": item.color } as CSSProperties
                        }
                      >
                        {item.icon}
                      </span>
                      <span>{item.name}</span>
                      {category === item.name && (
                        <span className="category-check">
                          <Icon name="check" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="amount-row">
                <label className="field-label" htmlFor="amount">
                  Amount
                </label>
                <div className="amount-control">
                  <span className="amount-symbol">
                    {currency === "USD" ? "$" : "៛"}
                  </span>
                  <input
                    id="amount"
                    inputMode={currency === "USD" ? "decimal" : "numeric"}
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setMessage("");
                      setMessageIsSuccess(false);
                    }}
                    placeholder={currency === "USD" ? "0.00" : "0"}
                    autoComplete="off"
                  />
                  <div className="amount-currency">
                    <button
                      type="button"
                      className={currency === "USD" ? "selected" : ""}
                      onClick={() => chooseCurrency("USD")}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      className={currency === "KHR" ? "selected" : ""}
                      onClick={() => chooseCurrency("KHR")}
                    >
                      KHR
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-two">
                <label className="field-label" htmlFor="expense-date">
                  Date
                  <input
                    id="expense-date"
                    type="date"
                    value={date}
                    max={today()}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label className="field-label" htmlFor="expense-note">
                  <span className="field-heading">
                    <span>Note</span>
                    <span className="optional">OPTIONAL</span>
                  </span>
                  <input
                    id="expense-note"
                    type="text"
                    value={note}
                    maxLength={140}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="What did you buy?"
                  />
                </label>
              </div>
              <p
                className={`form-message ${messageIsSuccess ? "success" : ""}`}
                aria-live="polite"
              >
                {message}
              </p>
              <button className="primary-button save-button" type="submit">
                {editingId ? "Save changes" : "Save expense"}{" "}
                <Icon name="arrow" />
              </button>
              <p className="privacy-hint">
                Saved on this device for now. Account sync will be connected
                with Supabase.
              </p>
            </form>
          </section>
        )}

        {route === "account" && (
          <section className="account-page">
            <p className="eyebrow">YOUR PREFERENCES</p>
            <h1>
              Account<span className="lime">.</span>
            </h1>
            <p className="subhead">
              A few details about your MoneyGuard setup.
            </p>
            <div className="surface account-panel">
              <div className="account-profile">
                <span className="profile-icon">
                  <Icon name="user" />
                </span>
                <div>
                  <b>Personal tracker</b>
                  <p>Local preview · Supabase sign-in coming next</p>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <b>Last used currency</b>
                  <p>Used as the default when you add an expense.</p>
                </div>
                <div className="currency-switch">
                  <button
                    className={currency === "USD" ? "selected" : ""}
                    onClick={() => chooseCurrency("USD")}
                  >
                    $ USD
                  </button>
                  <button
                    className={currency === "KHR" ? "selected" : ""}
                    onClick={() => chooseCurrency("KHR")}
                  >
                    ៛ KHR
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <b>Install MoneyGuard</b>
                  <p>Install from your browser menu on Android or desktop.</p>
                </div>
                <span className="install-tag">PWA ready</span>
              </div>
              <div className="settings-row danger-row">
                <div>
                  <b>Clear local expenses</b>
                  <p>Remove expense records stored in this browser.</p>
                </div>
                <button
                  className="outline-button danger-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Clear all expenses stored in this browser?",
                      )
                    )
                      setExpenses([]);
                  }}
                >
                  Clear data
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {(
          [
            ["analyze", "chart", "Analyze"],
            ["add", "plus", "Add"],
          ] as const
        ).map(([target, icon, label]) => (
          <Link
            key={target}
            href={target === "analyze" ? "/analyze" : "/add"}
            className={route === target ? "active" : ""}
            onClick={target === "add" ? startNewExpense : () => {
              setEditingId(null);
              setMessage("");
            }}
            aria-current={route === target ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon name={icon} />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function periodLabel(period: Period) {
  if (period === "day") return "Last 7 days";
  if (period === "week") return "Last 6 weeks";
  return "Last 6 months";
}

function makeBuckets(expenses: Expense[], period: Period) {
  const count = period === "day" ? 7 : 6;
  const todayDate = dateAtMidnight(today());
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const start = new Date(todayDate);
    if (period === "day") start.setDate(start.getDate() - offset);
    if (period === "week")
      start.setDate(start.getDate() - offset * 7 - start.getDay());
    if (period === "month") start.setMonth(start.getMonth() - offset, 1);
    const end = new Date(start);
    if (period === "day") end.setDate(end.getDate() + 1);
    if (period === "week") end.setDate(end.getDate() + 7);
    if (period === "month") end.setMonth(end.getMonth() + 1);
    return {
      start,
      end,
      label:
        period === "day"
          ? start.toLocaleDateString("en-US", { weekday: "short" })
          : start.toLocaleDateString("en-US", {
              month: "short",
              ...(period === "week" ? { day: "numeric" } : {}),
            }),
      amount: expenses
        .filter((expense) => {
          const date = dateAtMidnight(expense.date);
          return date >= start && date < end;
        })
        .reduce((sum, expense) => sum + expense.amountMinor, 0),
    };
  });
}

function compactMoney(value: number, currency: Currency) {
  if (currency === "KHR")
    return value >= 1000
      ? `៛${Math.round(value / 1000)}k`
      : `៛${Math.round(value)}`;
  const dollars = value / 100;
  return dollars >= 1000
    ? `$${(dollars / 1000).toFixed(1)}k`
    : `$${Math.round(dollars)}`;
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="chart-empty">
      <span className="empty-icon">
        <Icon name="chart" />
      </span>
      <p>{text}</p>
    </div>
  );
}

function Donut({
  items,
  total,
  currency,
}: {
  items: { name: string; amount: number; color: string }[];
  total: number;
  currency: Currency;
}) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const slices = items.map((item, index) => ({
    item,
    length: (item.amount / total) * circumference,
    offset: items
      .slice(0, index)
      .reduce(
        (sum, previous) => sum + (previous.amount / total) * circumference,
        0,
      ),
  }));
  return (
    <div className="donut-wrap">
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label="Pie chart showing expenses by category"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,.06)"
          strokeWidth="14"
        />
        {slices.map(({ item, length, offset }) => (
          <circle
            key={item.name}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={item.color}
            strokeWidth="14"
            strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        ))}
        <text x="60" y="56" textAnchor="middle">
          TOTAL
        </text>
        <text className="donut-total" x="60" y="72" textAnchor="middle">
          {compactMoney(total, currency)}
        </text>
      </svg>
    </div>
  );
}

function ExpenseRow({
  expense,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const item =
    categories.find((category) => category.name === expense.category) ??
    categories[categories.length - 1];
  return (
    <div className="expense-row">
      <span
        className="expense-category-icon"
        style={{ "--category-color": item.color } as CSSProperties}
      >
        {item.icon}
      </span>
      <span className="expense-description">
        <b>{expense.category}</b>
        <small>
          {dateAtMidnight(expense.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
          {expense.note ? ` · ${expense.note}` : ""}
        </small>
      </span>
      <b className="expense-amount">
        {money(amountToMajor(expense.amountMinor, expense.currency), expense.currency)}
      </b>
      <button
        className="edit-expense"
        onClick={onEdit}
        aria-label={`Edit ${expense.category} expense`}
      >
        Edit
      </button>
      <button
        className="delete-expense"
        onClick={onDelete}
        aria-label={`Delete ${expense.category} expense`}
      >
        ×
      </button>
    </div>
  );
}

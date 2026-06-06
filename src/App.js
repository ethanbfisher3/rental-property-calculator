import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './App.css';
import { calculateResults, calculateLoanPayment, calculateLoanBalance } from './utils/calculations';

const LOAN_TYPES = [
  { value: 'conventional', label: 'Conventional' },
  { value: 'private', label: 'Private Lender' },
  { value: 'hard_money', label: 'Hard Money' },
  { value: 'bridge', label: 'Bridge Loan' },
  { value: 'heloc', label: 'HELOC' },
  { value: 'seller', label: 'Seller Financing' },
  { value: 'other', label: 'Other' },
];

const defaultInputs = {
  purchasePrice: 350000,
  loans: [
    {
      id: 'loan-default',
      name: 'Bank Loan',
      type: 'conventional',
      amount: 280000,
      interestRate: 7.25,
      termYears: 30,
      startMonth: 0,
      payoffMonth: null,
      isInterestOnly: false,
    },
  ],
  closingCostsPct: 3,
  buyerAgentPct: 2.5,
  inspectionCost: 500,
  repairCost: 0,
  otherAcquisitionCost: 0,
  rooms: [{ id: 1, name: 'Unit 1', monthlyRent: 1400 }],
  otherMonthlyIncome: 0,
  vacancyRatePct: 5,
  propertyTaxMonthly: 300,
  insuranceMonthly: 120,
  hoaMonthly: 0,
  maintenancePct: 5,
  utilitiesMonthly: 0,
  capexPct: 5,
  otherExpensesMonthly: 0,
  usePropertyManager: false,
  propertyManagementPct: 10,
  appreciationRatePct: 3,
  rentGrowthPct: 2,
};

const STORAGE_KEY = 'rental-property-deals';

function loadDeals() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function migrateInputs(inputs) {
  if (inputs.loans && inputs.loans.length > 0) return inputs;
  const price = parseFloat(inputs.purchasePrice) || 0;
  const downPct = parseFloat(inputs.downPaymentPct) || 20;
  return {
    ...inputs,
    loans: [
      {
        id: 'loan_migrated',
        name: 'Mortgage',
        type: 'conventional',
        amount: Math.round(price * (1 - downPct / 100)),
        interestRate: parseFloat(inputs.interestRate) || 7.25,
        termYears: parseFloat(inputs.loanTermYears) || 30,
        startMonth: 0,
        payoffMonth: null,
        isInterestOnly: false,
      },
    ],
  };
}

function fmt(value) {
  if (!isFinite(value) || isNaN(value)) return '$—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value, dec = 1) {
  if (!isFinite(value) || isNaN(value)) return '—%';
  return `${value.toFixed(dec)}%`;
}

function quality(value, good, ok) {
  if (value >= good) return 'good';
  if (value >= ok) return 'ok';
  return 'bad';
}

function Info({ text }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  const onEnter = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const onLeave = useCallback(() => setPos(null), []);

  const onTouchEnd = useCallback((e) => {
    e.preventDefault();
    setPos(p => {
      if (p) return null;
      if (!ref.current) return null;
      const rect = ref.current.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top };
    });
  }, []);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const timer = setTimeout(() => document.addEventListener('touchstart', close, { once: true }), 0);
    return () => { clearTimeout(timer); document.removeEventListener('touchstart', close); };
  }, [pos]);

  return (
    <>
      <span ref={ref} className="info-icon" onMouseEnter={onEnter} onMouseLeave={onLeave} onTouchEnd={onTouchEnd}>
        i
      </span>
      {pos &&
        createPortal(
          <div className="tooltip-box" style={{ left: pos.x, top: pos.y }}>
            {text}
          </div>,
          document.body
        )}
    </>
  );
}

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button
        className={`section-header${open ? '' : ' section-header-closed'}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="section-title">
          <span className="section-icon">{icon}</span>
          {title}
        </span>
        <span className={`chevron${open ? ' open' : ''}`}>›</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function Field({ label, hint, prefix, suffix, value, onChange, step = 1, min = 0, wide }) {
  return (
    <div className={`field${wide ? ' field-wide' : ''}`}>
      <label className="field-label">
        {label}
        {hint && <Info text={hint} />}
      </label>
      <div className="field-input">
        {prefix && <span className="field-adorn">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onChange(isNaN(v) ? 0 : v);
          }}
        />
        {suffix && <span className="field-adorn field-adorn-right">{suffix}</span>}
      </div>
    </div>
  );
}

function CalcRow({ label, value, total, income, expense }) {
  let cls = 'calc-row';
  if (total) cls += ' calc-total';
  if (income) cls += ' calc-income';
  if (expense) cls += ' calc-expense';
  return (
    <div className={cls}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MetricTile({ label, value, sub, q, hint }) {
  return (
    <div className={`tile tile-${q}`}>
      <div className="tile-val">{value}</div>
      <div className="tile-label">
        {label}
        {hint && <Info text={hint} />}
      </div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

function ResRow({ label, value, hint, income, expense, total, big }) {
  let cls = 'res-row';
  if (income) cls += ' res-income';
  if (expense) cls += ' res-expense';
  if (total) cls += ' res-total';
  if (big) cls += ' res-big';
  return (
    <div className={cls}>
      <span>
        {label}
        {hint && <Info text={hint} />}
      </span>
      <span>{value}</span>
    </div>
  );
}

// ── TUTORIAL MODAL ──────────────────────────────────────────────────────────

function TutorialModal({ onClose }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="tutorial-modal" onClick={e => e.stopPropagation()}>
        <div className="tutorial-header">
          <div>
            <h2>Multiple Loans &amp; Refinancing Guide</h2>
            <p className="tutorial-subtitle">Model complex financing: private lenders, bank loans, and future refinances</p>
          </div>
          <button className="tutorial-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="tutorial-body">

          <div className="tutorial-section">
            <div className="tutorial-step-badge">1</div>
            <div className="tutorial-step-content">
              <h3>Why Use Multiple Loans?</h3>
              <p>Real estate investors rarely use a single lender. Common combinations include:</p>
              <ul>
                <li><strong>Bank + Private Lender:</strong> A bank covers 70–75%, a private lender covers another 10–15%, reducing your out-of-pocket down payment.</li>
                <li><strong>Hard Money → Refinance:</strong> A hard money loan funds a quick purchase or rehab, then you refinance into a conventional mortgage once the property stabilizes.</li>
                <li><strong>Seller Financing:</strong> The seller carries a note for part of the purchase price alongside your bank loan.</li>
              </ul>
              <p>This calculator lets you model all of these together and see how your finances change over time.</p>
            </div>
          </div>

          <div className="tutorial-section">
            <div className="tutorial-step-badge">2</div>
            <div className="tutorial-step-content">
              <h3>Loan Fields Explained</h3>
              <dl className="tutorial-fields">
                <dt>Name</dt>
                <dd>A label for this loan — e.g., "First National Bank", "Private Lender (Uncle Bob)"</dd>
                <dt>Type</dt>
                <dd>The loan category for your reference. Doesn't affect calculations.</dd>
                <dt>Amount ($)</dt>
                <dd>The principal you're borrowing from this lender. The down payment is automatically calculated as <em>Purchase Price − sum of all month-0 loans</em>.</dd>
                <dt>Interest Rate (%)</dt>
                <dd>Annual rate — e.g., enter <code>10</code> for 10%. Private lenders typically charge 8–15%.</dd>
                <dt>Term (years)</dt>
                <dd>How long until this loan fully amortizes. For interest-only or balloon loans, set this to the balloon/payoff period.</dd>
                <dt>Start Month</dt>
                <dd><strong>0</strong> = begins at purchase. <strong>24</strong> = begins 2 years after purchase. Use a future start month for refinance loans.</dd>
                <dt>Payoff Month</dt>
                <dd>If this loan will be paid off early — e.g., refinanced — enter that month here. Leave blank to let it run its full term. The estimated remaining balance is shown as a hint.</dd>
                <dt>Interest Only</dt>
                <dd>Check this if you only pay interest each month (no principal reduction). Common for private lenders and bridge loans. The full balance remains until you sell or refinance.</dd>
              </dl>
            </div>
          </div>

          <div className="tutorial-section">
            <div className="tutorial-step-badge">3</div>
            <div className="tutorial-step-content">
              <h3>Example: Bank Loan + Private Lender</h3>
              <p>You're buying a <strong>$200,000</strong> duplex. A bank will lend 60% and a private lender covers another 25%:</p>
              <div className="tutorial-example">
                <table className="tutorial-ex-table">
                  <thead>
                    <tr>
                      <th>Loan</th>
                      <th>Amount</th>
                      <th>Rate</th>
                      <th>Term</th>
                      <th>Start</th>
                      <th>Payoff</th>
                      <th>IO?</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Bank Loan</td>
                      <td>$120,000</td>
                      <td>7.25%</td>
                      <td>30 yrs</td>
                      <td>Mo. 0</td>
                      <td>—</td>
                      <td>No</td>
                    </tr>
                    <tr>
                      <td>Private Lender</td>
                      <td>$50,000</td>
                      <td>10%</td>
                      <td>5 yrs</td>
                      <td>Mo. 0</td>
                      <td>Mo. 24</td>
                      <td>Yes</td>
                    </tr>
                  </tbody>
                </table>
                <p className="tutorial-example-note">
                  → Implied down payment: $200,000 − $120,000 − $50,000 = <strong>$30,000 (15%)</strong><br />
                  → Current monthly debt service = bank P&amp;I + private interest-only payment<br />
                  → Private lender marked for payoff at month 24 (refinance planned)
                </p>
              </div>
            </div>
          </div>

          <div className="tutorial-section">
            <div className="tutorial-step-badge">4</div>
            <div className="tutorial-step-content">
              <h3>Example: Adding a Refinance Loan</h3>
              <p>Continuing from above — at month 24 you refinance both loans into one conventional mortgage.</p>
              <p><strong>Step 1:</strong> Set the Payoff Month on both existing loans to <code>24</code>.</p>
              <p><strong>Step 2:</strong> Add a new loan with Start Month <code>24</code>:</p>
              <div className="tutorial-example">
                <table className="tutorial-ex-table">
                  <thead>
                    <tr>
                      <th>Loan</th>
                      <th>Amount</th>
                      <th>Rate</th>
                      <th>Term</th>
                      <th>Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Refinance Loan</td>
                      <td>$172,000</td>
                      <td>6.75%</td>
                      <td>30 yrs</td>
                      <td>Mo. 24</td>
                    </tr>
                  </tbody>
                </table>
                <p className="tutorial-example-note">
                  → Amount covers: bank balance (~$118k) + private lender ($50k) + refi closing costs (~$4k)<br />
                  → Check the "Estimated balance at payoff" hint on each old loan to size the refi amount<br />
                  → The Projections table will show Year 2 as a milestone with the new loan structure
                </p>
              </div>
            </div>
          </div>

          <div className="tutorial-section">
            <div className="tutorial-step-badge">5</div>
            <div className="tutorial-step-content">
              <h3>How the Calculations Work</h3>
              <ul>
                <li><strong>Current cash flow</strong> only includes loans with Start Month = 0. Future loans don't affect current metrics.</li>
                <li><strong>Down payment</strong> = Purchase Price minus all month-0 loan amounts. If your loans total more than the purchase price, down payment shows as $0.</li>
                <li><strong>DSCR and Break-even</strong> are based on current (month-0) debt service only.</li>
                <li><strong>Projections table</strong> automatically adds milestone rows at each loan event year (e.g., Year 2 if a loan payoff is at month 24). The Loan Balance column reflects the total across all active loans at that year.</li>
                <li><strong>Interest-only loans</strong> keep their full balance in projections until they're paid off or their term ends.</li>
              </ul>
            </div>
          </div>

          <div className="tutorial-section">
            <div className="tutorial-step-badge">6</div>
            <div className="tutorial-step-content">
              <h3>Pro Tips</h3>
              <ul>
                <li>Use the <strong>"Estimated balance at payoff"</strong> hint on any loan with a payoff month set — it tells you exactly how much your refinance loan needs to cover.</li>
                <li>For a <strong>hard money + refi</strong> scenario: set the hard money loan as interest-only with a payoff month, then add a conventional refinance loan starting at that same month.</li>
                <li>If you have a <strong>seller carryback</strong>, model it like a private lender with whatever terms you negotiate.</li>
                <li>Future loans (Start Month &gt; 0) appear in the projections table but don't affect current Cash-on-Cash Return, Cap Rate, or DSCR. These metrics always reflect your month-0 financing.</li>
                <li>Keep the <strong>total of month-0 loans</strong> below the purchase price to maintain a positive down payment (equity at purchase).</li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}

// ── MAIN APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs);
  const [deals, setDeals] = useState(loadDeals);
  const [activeDealId, setActiveDealId] = useState(null);

  const [saveModal, setSaveModal] = useState(false);
  const [dealName, setDealName] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
    } catch (e) {
      console.error('localStorage write failed', e);
    }
  }, [deals]);

  const r = useMemo(() => calculateResults(inputs), [inputs]);

  const cfQ = quality(r.monthlyCashFlow, 200, 0);
  const cocQ = quality(r.cashOnCash, 10, 6);
  const capQ = quality(r.capRate, 8, 5);
  const dscrQ = quality(r.dscr, 1.25, 1.0);
  const beoQ = r.breakEvenOccupancy <= 70 ? 'good' : r.breakEvenOccupancy <= 85 ? 'ok' : 'bad';

  const set = (key, val) => {
    setInputs(p => ({ ...p, [key]: val }));
    setActiveDealId(null);
  };

  // Room management
  const addRoom = () => {
    const nextId = Math.max(0, ...inputs.rooms.map(rr => rr.id)) + 1;
    set('rooms', [...inputs.rooms, { id: nextId, name: `Unit ${nextId}`, monthlyRent: 1000 }]);
  };

  const removeRoom = id => {
    if (inputs.rooms.length > 1)
      set('rooms', inputs.rooms.filter(rr => rr.id !== id));
  };

  const updateRoom = (id, field, val) =>
    set('rooms', inputs.rooms.map(rr => (rr.id === id ? { ...rr, [field]: val } : rr)));

  // Loan management
  const addLoan = () => {
    const newLoan = {
      id: `loan_${Date.now()}`,
      name: 'New Loan',
      type: 'private',
      amount: 0,
      interestRate: 10,
      termYears: 5,
      startMonth: 0,
      payoffMonth: null,
      isInterestOnly: false,
    };
    set('loans', [...inputs.loans, newLoan]);
  };

  const removeLoan = id => {
    if (inputs.loans.length > 1)
      set('loans', inputs.loans.filter(l => l.id !== id));
  };

  const updateLoan = (id, field, val) =>
    set('loans', inputs.loans.map(l => l.id === id ? { ...l, [field]: val } : l));

  const showToast = msg => {
    clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const openSaveModal = () => {
    setEditingId(null);
    setDealName('');
    setDealNotes('');
    setSaveModal(true);
  };

  const openEditModal = (deal, e) => {
    e.stopPropagation();
    setEditingId(deal.id);
    setDealName(deal.name);
    setDealNotes(deal.notes || '');
    setSaveModal(true);
  };

  const commitSave = () => {
    const name = dealName.trim();
    if (!name) return;

    if (editingId) {
      setDeals(prev =>
        prev.map(d => d.id === editingId ? { ...d, name, notes: dealNotes.trim() } : d)
      );
      showToast('Deal updated');
    } else {
      const newDeal = {
        id: `deal_${Date.now()}`,
        name,
        notes: dealNotes.trim(),
        savedAt: new Date().toISOString(),
        inputs: { ...inputs },
        snapshot: {
          cf: r.monthlyCashFlow,
          coc: r.cashOnCash,
          capRate: r.capRate,
        },
      };
      setDeals(prev => [newDeal, ...prev]);
      setActiveDealId(newDeal.id);
      showToast(`"${name}" saved`);
    }

    setSaveModal(false);
    setDealName('');
    setDealNotes('');
    setEditingId(null);
  };

  const loadDeal = deal => {
    setInputs(migrateInputs(deal.inputs));
    setActiveDealId(deal.id);
    setNotesOpen(deal.notes ? true : false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Loaded "${deal.name}"`);
  };

  const deleteDeal = (id, e) => {
    e.stopPropagation();
    setDeals(prev => prev.filter(d => d.id !== id));
    if (activeDealId === id) setActiveDealId(null);
    showToast('Deal deleted');
  };

  const activeDeal = deals.find(d => d.id === activeDealId);

  // Derived: initial loans (startMonth === 0)
  const initialLoans = (inputs.loans || []).filter(l => (parseFloat(l.startMonth) || 0) === 0);
  const futureLoans = (inputs.loans || []).filter(l => (parseFloat(l.startMonth) || 0) > 0);

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-text">
            <h1>Rental Property Analyzer</h1>
            <p>Real-time cash flow, returns, and investment metrics</p>
          </div>
          <div className="header-actions">
            <button className="btn-tutorial" onClick={() => setTutorialOpen(true)}>
              <span className="btn-tutorial-full">How It Works</span>
              <span className="btn-tutorial-short">?</span>
            </button>
            <button className="btn-save" onClick={openSaveModal}>
              Save Deal
            </button>
            <div className={`header-cf header-cf-${cfQ}`}>
              <div className="header-cf-num">{fmt(r.monthlyCashFlow)}/mo</div>
              <div className="header-cf-label">Net Cash Flow</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── SAVED DEALS BAR ── */}
      {deals.length > 0 && (
        <div className="deals-bar">
          <span className="deals-bar-label">Saved Deals</span>
          <div className="deals-scroll">
            {deals.map(deal => {
              const isActive = deal.id === activeDealId;
              const cfPos = deal.snapshot.cf >= 0;
              return (
                <div
                  key={deal.id}
                  className={`deal-card${isActive ? ' deal-card-active' : ''}`}
                  onClick={() => loadDeal(deal)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && loadDeal(deal)}
                >
                  <div className="deal-card-name">{deal.name}</div>
                  <div className={`deal-card-cf ${cfPos ? 'pos' : 'neg'}`}>
                    {fmt(deal.snapshot.cf)}/mo
                  </div>
                  <div className="deal-card-stats">
                    CoC {pct(deal.snapshot.coc)} · Cap {pct(deal.snapshot.capRate)}
                  </div>
                  {deal.notes && (
                    <div className="deal-card-note-icon" title={deal.notes}>📝</div>
                  )}
                  <div className="deal-card-actions">
                    <button
                      className="deal-edit"
                      onClick={e => openEditModal(deal, e)}
                      title="Edit name / notes"
                    >
                      ✎
                    </button>
                    <button
                      className="deal-delete"
                      onClick={e => deleteDeal(deal.id, e)}
                      title="Delete deal"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="layout">
        {/* ── INPUTS ── */}
        <div className="inputs-col">

          {activeDeal && (
            <div className="active-deal-banner">
              <div className="active-deal-info">
                <span className="active-deal-dot" />
                <span className="active-deal-name">{activeDeal.name}</span>
                {activeDeal.notes && (
                  <button
                    className="active-deal-notes-toggle"
                    onClick={() => setNotesOpen(o => !o)}
                  >
                    {notesOpen ? 'Hide notes' : 'Show notes'}
                  </button>
                )}
              </div>
              <button className="btn-save-small" onClick={openSaveModal}>
                Save as new
              </button>
            </div>
          )}
          {activeDeal && notesOpen && activeDeal.notes && (
            <div className="active-deal-notes">{activeDeal.notes}</div>
          )}

          <Section title="Purchase Price" icon="🏡">
            <Field
              label="Purchase Price"
              hint="The total price you're paying for the property."
              value={inputs.purchasePrice}
              onChange={v => set('purchasePrice', v)}
              prefix="$"
              step={1000}
              wide
            />
          </Section>

          {/* ── FINANCING / MULTI-LOAN ── */}
          <Section title="Financing" icon="🏦">
            <div className="loans-list">
              {(inputs.loans || []).map(loan => {
                const startM = parseFloat(loan.startMonth) || 0;
                const payoffM = loan.payoffMonth != null ? parseFloat(loan.payoffMonth) : null;
                const isFuture = startM > 0;

                // Estimated balance at payoff (for hint)
                let balanceAtPayoff = null;
                if (payoffM !== null) {
                  const tempLoan = { ...loan, payoffMonth: null };
                  balanceAtPayoff = calculateLoanBalance(tempLoan, payoffM);
                }

                // Monthly payment for this loan
                const monthlyPmt = calculateLoanPayment(loan);

                return (
                  <div className={`loan-card${isFuture ? ' loan-card-future' : ''}`} key={loan.id}>
                    <div className="loan-card-header">
                      {isFuture && (
                        <span className="loan-future-badge">Future Loan</span>
                      )}
                      <input
                        className="loan-name-input"
                        type="text"
                        value={loan.name}
                        onChange={e => updateLoan(loan.id, 'name', e.target.value)}
                        placeholder="Loan name"
                      />
                      <select
                        className="loan-type-select"
                        value={loan.type}
                        onChange={e => updateLoan(loan.id, 'type', e.target.value)}
                      >
                        {LOAN_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        className="loan-remove"
                        onClick={() => removeLoan(loan.id)}
                        disabled={inputs.loans.length === 1}
                        title="Remove this loan"
                      >
                        ×
                      </button>
                    </div>

                    <div className="loan-card-fields grid3">
                      <Field
                        label="Amount"
                        hint="The principal borrowed from this lender. Down payment is calculated as Purchase Price minus all month-0 loan totals."
                        prefix="$"
                        value={loan.amount}
                        onChange={v => updateLoan(loan.id, 'amount', v)}
                        step={1000}
                      />
                      <Field
                        label="Interest Rate"
                        hint="Annual interest rate for this loan. Private lenders typically charge 8–15%. Conventional investment property rates are 0.5–1% higher than primary residence rates."
                        suffix="%"
                        value={loan.interestRate}
                        onChange={v => updateLoan(loan.id, 'interestRate', v)}
                        step={0.125}
                      />
                      <Field
                        label="Term"
                        hint="Loan term in years. For balloon/interest-only loans, use the balloon period. For a standard amortizing mortgage, use 15 or 30 years."
                        suffix="yrs"
                        value={loan.termYears}
                        onChange={v => updateLoan(loan.id, 'termYears', v)}
                        step={1}
                        min={1}
                      />
                    </div>

                    <div className="loan-card-timing grid2">
                      <div className="field">
                        <label className="field-label">
                          Start Month
                          <Info text="When this loan begins. 0 = at purchase. Enter 24 for a loan that starts 2 years after purchase (e.g. a refinance). Loans with start month > 0 show as 'Future Loans' and don't affect current cash flow." />
                        </label>
                        <div className="field-input">
                          <span className="field-adorn">Mo.</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={loan.startMonth}
                            onChange={e =>
                              updateLoan(loan.id, 'startMonth', parseInt(e.target.value) || 0)
                            }
                          />
                          {startM > 0 && (
                            <span className="field-adorn field-adorn-right">
                              Yr {(startM / 12).toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="field">
                        <label className="field-label">
                          Payoff Month
                          <Info text="Leave blank to let the loan run its full term. Set a month number if this loan will be paid off early — e.g., when refinancing. The remaining balance at that month is shown below." />
                        </label>
                        <div className="field-input">
                          <span className="field-adorn">Mo.</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="never"
                            value={payoffM === null ? '' : payoffM}
                            onChange={e => {
                              const v = e.target.value;
                              updateLoan(loan.id, 'payoffMonth', v === '' ? null : parseInt(v) || 0);
                            }}
                          />
                          {payoffM !== null && payoffM > 0 && (
                            <span className="field-adorn field-adorn-right">
                              Yr {(payoffM / 12).toFixed(1)}
                            </span>
                          )}
                        </div>
                        {balanceAtPayoff !== null && balanceAtPayoff > 0 && (
                          <div className="loan-payoff-note">
                            Estimated balance at payoff: ~{fmt(balanceAtPayoff)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="loan-card-footer">
                      <label className="checkbox-label loan-io-check">
                        <input
                          type="checkbox"
                          checked={loan.isInterestOnly}
                          onChange={e => updateLoan(loan.id, 'isInterestOnly', e.target.checked)}
                        />
                        <span>Interest-only payments</span>
                        <Info text="Interest-only loans don't reduce the principal. You pay just the interest each month. Common for private lenders, hard money, and HELOCs. The full balance remains until sold or refinanced." />
                      </label>
                      {monthlyPmt > 0 && (
                        <span className="loan-pmt-preview">
                          {fmt(monthlyPmt)}/mo
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="add-room-btn" onClick={addLoan} style={{ marginTop: 10 }}>
              + Add Loan
            </button>

            <div className="grid2" style={{ marginTop: 14 }}>
              <Field
                label="Closing Costs"
                hint="Fees paid at closing: title insurance, escrow, lender origination fee, appraisal, attorney fees, transfer taxes. Typically 2–5% of the purchase price. Get a Loan Estimate from your lender for accurate figures."
                value={inputs.closingCostsPct}
                onChange={v => set('closingCostsPct', v)}
                suffix="%"
                step={0.25}
              />
            </div>

            <div className="calc-rows">
              <CalcRow label={`Down Payment (implied) · ${pct(r.downPaymentPct)}`} value={fmt(r.downPayment)} />
              {initialLoans.length > 1 && initialLoans.map(loan => (
                <CalcRow
                  key={loan.id}
                  label={`  ${loan.name}`}
                  value={fmt(parseFloat(loan.amount) || 0)}
                />
              ))}
              <CalcRow
                label={`${initialLoans.length > 1 ? 'Total Loans' : 'Loan Amount'} · LTV ${pct(r.ltv)}`}
                value={fmt(r.loanAmount)}
              />
              {futureLoans.length > 0 && (
                <CalcRow
                  label={`${futureLoans.length} future loan${futureLoans.length > 1 ? 's' : ''} (not in current cash flow)`}
                  value=""
                />
              )}
              <CalcRow label="Total Monthly Debt Service" value={fmt(r.monthlyMortgage)} total />
            </div>
          </Section>

          <Section title="Acquisition Costs" icon="📝">
            <div className="grid2">
              <Field
                label="Buyer Agent Commission"
                hint="Fee paid to your real estate agent, typically 2–3% of purchase price. After the 2024 NAR settlement, this is now negotiable and may be paid by buyer or seller. Set to 0 if buying without an agent."
                value={inputs.buyerAgentPct}
                onChange={v => set('buyerAgentPct', v)}
                suffix="%"
                step={0.25}
              />
              <Field
                label="Inspection Cost"
                hint="Cost of a professional home inspection before purchase. Typically $300–$600. Never skip this — inspections can uncover thousands in hidden problems and give you negotiating power."
                value={inputs.inspectionCost}
                onChange={v => set('inspectionCost', v)}
                prefix="$"
                step={100}
              />
              <Field
                label="Initial Repairs / Renovation"
                hint="Upfront cost to make the property rent-ready: paint, flooring, appliances, fixtures. Be conservative — renovation costs almost always exceed initial estimates."
                value={inputs.repairCost}
                onChange={v => set('repairCost', v)}
                prefix="$"
                step={500}
              />
              <Field
                label="Other One-time Costs"
                hint="Any other upfront costs: landscaping, furniture for furnished rentals, professional cleaning, marketing/listing fees, LLC setup costs, etc."
                value={inputs.otherAcquisitionCost}
                onChange={v => set('otherAcquisitionCost', v)}
                prefix="$"
                step={100}
              />
            </div>
            <div className="calc-rows">
              <CalcRow label="Down Payment" value={fmt(r.downPayment)} />
              <CalcRow label="Closing Costs" value={fmt(r.closingCosts)} />
              <CalcRow label="Agent Fee" value={fmt(r.buyerAgentFee)} />
              <CalcRow
                label="Inspection + Repairs + Other"
                value={fmt(inputs.inspectionCost + inputs.repairCost + inputs.otherAcquisitionCost)}
              />
              <CalcRow label="Total Cash to Close" value={fmt(r.totalCashInvested)} total />
            </div>
          </Section>

          <Section title="Rental Income" icon="💵">
            <div className="rooms">
              {inputs.rooms.map(room => (
                <div className="room-row" key={room.id}>
                  <input
                    className="room-name-input"
                    type="text"
                    value={room.name}
                    onChange={e => updateRoom(room.id, 'name', e.target.value)}
                    placeholder="Unit name"
                  />
                  <div className="field-input room-rent-wrap">
                    <span className="field-adorn">$</span>
                    <input
                      type="number"
                      value={room.monthlyRent}
                      min={0}
                      step={50}
                      onChange={e => updateRoom(room.id, 'monthlyRent', parseFloat(e.target.value) || 0)}
                    />
                    <span className="field-adorn field-adorn-right">/mo</span>
                  </div>
                  <button
                    className="room-remove"
                    onClick={() => removeRoom(room.id)}
                    disabled={inputs.rooms.length === 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button className="add-room-btn" onClick={addRoom}>+ Add Unit / Room</button>
            </div>
            <div className="grid2" style={{ marginTop: 16 }}>
              <Field
                label="Other Income"
                hint="Additional monthly income beyond rent: parking spaces, coin-operated laundry, storage units, pet fees, short-term rental premiums, etc."
                value={inputs.otherMonthlyIncome}
                onChange={v => set('otherMonthlyIncome', v)}
                prefix="$"
                step={25}
              />
              <Field
                label="Vacancy Rate"
                hint="The percentage of time your units will sit empty — due to tenant turnover, time to find new tenants, evictions, or seasonal demand. Market average is 5–10% annually. Conservatively use 8–10% for a new investor."
                value={inputs.vacancyRatePct}
                onChange={v => set('vacancyRatePct', v)}
                suffix="%"
                step={1}
              />
            </div>
            <div className="calc-rows">
              <CalcRow label="Gross Monthly Rent" value={fmt(r.grossMonthlyRent)} income />
              <CalcRow label={`Vacancy Loss (${pct(inputs.vacancyRatePct)})`} value={`−${fmt(r.vacancyLoss)}`} expense />
              <CalcRow label="Effective Gross Income" value={fmt(r.effectiveGrossIncome)} total />
            </div>
          </Section>

          <Section title="Monthly Operating Expenses" icon="📋">
            <div className="grid2">
              <Field
                label="Property Tax"
                hint="Monthly share of your annual property tax bill. Find your estimate on the county assessor's website. Remember: taxes often increase after a sale since the property is reassessed at the new purchase price."
                value={inputs.propertyTaxMonthly}
                onChange={v => set('propertyTaxMonthly', v)}
                prefix="$"
                step={25}
              />
              <Field
                label="Insurance"
                hint="Monthly landlord (rental property) insurance premium. This is different from — and more expensive than — a standard homeowner's policy. It covers dwelling, liability, and lost rental income. Typically $80–$200/month depending on property and location."
                value={inputs.insuranceMonthly}
                onChange={v => set('insuranceMonthly', v)}
                prefix="$"
                step={10}
              />
              <Field
                label="HOA Fees"
                hint="Homeowners Association monthly dues. Important: check the HOA rules before buying — many HOAs restrict or prohibit rentals. Also factor in potential special assessments for major repairs."
                value={inputs.hoaMonthly}
                onChange={v => set('hoaMonthly', v)}
                prefix="$"
                step={25}
              />
              <Field
                label="Utilities (landlord-paid)"
                hint="Monthly utilities you pay as the landlord: water, trash, gas in common areas, electricity for hallways, etc. Many landlords pass all utilities to tenants, which simplifies management."
                value={inputs.utilitiesMonthly}
                onChange={v => set('utilitiesMonthly', v)}
                prefix="$"
                step={25}
              />
              <Field
                label="Maintenance Reserve"
                hint="Monthly savings reserve for routine repairs and upkeep: leaky faucets, broken appliances, patching walls, pest control, etc. This is NOT actual spending — it's money you set aside each month. Typically 5–10% of gross rent. Older properties need more."
                value={inputs.maintenancePct}
                onChange={v => set('maintenancePct', v)}
                suffix="% of rent"
                step={0.5}
              />
              <Field
                label="CapEx Reserve"
                hint="Capital Expenditure reserve for major system replacements: roof ($8–20K), HVAC ($5–15K), water heater ($1–2K), plumbing, electrical, flooring, windows. Spread those big costs across months now so they don't blindside you. Typically 5–10% of gross rent."
                value={inputs.capexPct}
                onChange={v => set('capexPct', v)}
                suffix="% of rent"
                step={0.5}
              />
              <Field
                label="Other Monthly Expenses"
                hint="Any other recurring costs not listed above: accounting/bookkeeping fees, LLC filing fees, lawn care, snow removal, pool maintenance, security systems, advertising for tenants, etc."
                value={inputs.otherExpensesMonthly}
                onChange={v => set('otherExpensesMonthly', v)}
                prefix="$"
                step={25}
              />
            </div>
            <div className="calc-rows">
              <CalcRow label="Total Operating Expenses" value={`−${fmt(r.totalOperatingExpenses)}`} expense total />
            </div>
          </Section>

          <Section title="Property Management" icon="👔">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={inputs.usePropertyManager}
                onChange={e => set('usePropertyManager', e.target.checked)}
              />
              <span>I plan to use a property manager</span>
            </label>
            {inputs.usePropertyManager && (
              <div style={{ marginTop: 14 }}>
                <Field
                  label="Management Fee"
                  hint="Monthly fee charged by the property management company, as a percentage of collected rent. They handle tenant screening, rent collection, maintenance requests, inspections, and evictions. Typically 8–12%. Worth it if you live far away or value your time."
                  value={inputs.propertyManagementPct}
                  onChange={v => set('propertyManagementPct', v)}
                  suffix="% of collected rent"
                  step={0.5}
                  wide
                />
                <div className="calc-rows">
                  <CalcRow label="Monthly Management Fee" value={`−${fmt(r.propertyManagementMonthly)}`} expense />
                </div>
              </div>
            )}
          </Section>

          <Section title="Appreciation & Growth (for projections)" icon="📈" defaultOpen={false}>
            <div className="grid2">
              <Field
                label="Annual Appreciation"
                hint="Expected annual increase in property value. The US national average is roughly 3–4% historically, but varies enormously by market. High-growth metros can exceed 7%+; rural areas may be flat. Don't rely on appreciation — a deal should work on cash flow alone."
                value={inputs.appreciationRatePct}
                onChange={v => set('appreciationRatePct', v)}
                suffix="%"
                step={0.25}
              />
              <Field
                label="Annual Rent Growth"
                hint="Expected annual increase in rental rates. Typically tracks inflation (2–3%). In strong rental markets, 3–5% is realistic. Used only for the long-term projections table."
                value={inputs.rentGrowthPct}
                onChange={v => set('rentGrowthPct', v)}
                suffix="%"
                step={0.25}
              />
            </div>
          </Section>
        </div>

        {/* ── RESULTS ── */}
        <div className="results-col">

          <div className="tiles">
            <MetricTile
              label="Cash-on-Cash Return"
              hint="Annual net cash flow ÷ Total cash invested. The most important metric for cash flow investors. Shows how much cash you earn annually per dollar invested. Target: 8–12%+. Does NOT include appreciation."
              value={pct(r.cashOnCash)}
              sub={r.cashOnCash >= 10 ? 'Strong' : r.cashOnCash >= 6 ? 'Average' : 'Below average'}
              q={cocQ}
            />
            <MetricTile
              label="Cap Rate"
              hint="Annual NOI ÷ Purchase price. Compares properties independently of financing — essentially the return if you paid all cash. Target varies by market: 5% in expensive coastal cities; 8%+ in secondary/tertiary markets. Use it to compare deals in the same market."
              value={pct(r.capRate)}
              sub={r.capRate >= 8 ? 'Strong' : r.capRate >= 5 ? 'Average' : 'Low'}
              q={capQ}
            />
            <MetricTile
              label="Debt Service Coverage"
              hint="DSCR: Net Operating Income ÷ Total monthly debt service. Measures how easily NOI covers all loan payments. 1.0 = break-even; 1.25 = minimum most lenders require; 1.5+ = strong. Reflects all month-0 loans."
              value={isFinite(r.dscr) ? r.dscr.toFixed(2) : '—'}
              sub={r.dscr >= 1.25 ? 'Lender-safe' : r.dscr >= 1.0 ? 'Break-even' : 'Negative flow'}
              q={dscrQ}
            />
            <MetricTile
              label="Break-even Occupancy"
              hint="The minimum occupancy rate needed to cover ALL expenses including debt service. Lower is better. Under 70% is excellent; 70–85% is acceptable; above 85% means very little margin of safety."
              value={pct(r.breakEvenOccupancy)}
              sub={r.breakEvenOccupancy <= 70 ? 'Low risk' : r.breakEvenOccupancy <= 85 ? 'Moderate' : 'High risk'}
              q={beoQ}
            />
          </div>

          <div className="card">
            <h3>Investment Summary</h3>
            <ResRow label="Purchase Price" value={fmt(inputs.purchasePrice)} />
            <ResRow
              label={`Down Payment (${pct(r.downPaymentPct)})`}
              hint="Purchase price minus all month-0 loan totals. This is your initial equity in the property."
              value={fmt(r.downPayment)}
            />
            {initialLoans.length > 1 && initialLoans.map(loan => (
              <ResRow
                key={loan.id}
                label={`  ${loan.name}`}
                value={fmt(parseFloat(loan.amount) || 0)}
              />
            ))}
            <ResRow
              label={initialLoans.length > 1
                ? `Total Loans · LTV ${pct(r.ltv)}`
                : `Loan Amount · LTV ${pct(r.ltv)}`}
              hint={`Loan-to-Value (LTV) is ${pct(r.ltv)} — the percentage of the purchase price financed. LTV above 80% typically requires Private Mortgage Insurance (PMI) for conventional loans.`}
              value={fmt(r.loanAmount)}
            />
            {futureLoans.length > 0 && (
              <ResRow
                label={`Future Loans (${futureLoans.length})`}
                hint="Loans with a Start Month > 0. These are planned future financing events (e.g., a refinance) and don't affect current cash flow or investment metrics."
                value={`${fmt(futureLoans.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0))} total`}
              />
            )}
            <ResRow
              label="Closing Costs & Agent Fees"
              hint="Non-recoverable transaction costs: title, escrow, lender fees, and buyer agent commission."
              value={fmt(r.closingCosts + r.buyerAgentFee)}
            />
            <ResRow
              label="Inspection + Repairs + Other"
              value={fmt(inputs.inspectionCost + inputs.repairCost + inputs.otherAcquisitionCost)}
            />
            <ResRow
              label="Total Cash Invested"
              hint="All cash out of pocket to acquire the property: down payment + closing costs + agent fees + inspection + repairs. This is the denominator in your cash-on-cash return calculation."
              value={fmt(r.totalCashInvested)}
              total
            />
          </div>

          <div className="card">
            <h3>Monthly Cash Flow</h3>
            <ResRow
              label="Gross Rent Income"
              hint="Total rent if all units are occupied 100% of the time. Your actual collected income will be lower due to vacancy."
              value={`+${fmt(r.grossMonthlyRent)}`}
              income
            />
            <ResRow
              label={`Vacancy (${pct(inputs.vacancyRatePct)})`}
              hint="Expected lost income from empty units, tenant turnover, and time needed to find new tenants. Always account for this — even great properties sit empty between tenants."
              value={`−${fmt(r.vacancyLoss)}`}
              expense
            />
            <ResRow
              label="Effective Gross Income"
              hint="Gross rent minus vacancy losses. The realistic monthly income you can expect to collect."
              value={fmt(r.effectiveGrossIncome)}
              total
            />

            <div className="res-divider" />

            {inputs.propertyTaxMonthly > 0 && (
              <ResRow label="Property Tax" value={`−${fmt(inputs.propertyTaxMonthly)}`} expense />
            )}
            {inputs.insuranceMonthly > 0 && (
              <ResRow label="Insurance" value={`−${fmt(inputs.insuranceMonthly)}`} expense />
            )}
            {inputs.hoaMonthly > 0 && (
              <ResRow label="HOA" value={`−${fmt(inputs.hoaMonthly)}`} expense />
            )}
            {inputs.utilitiesMonthly > 0 && (
              <ResRow label="Utilities" value={`−${fmt(inputs.utilitiesMonthly)}`} expense />
            )}
            <ResRow
              label={`Maintenance (${pct(inputs.maintenancePct)} of rent)`}
              hint="Monthly reserve for routine repairs. Not actual spending this month — money set aside so repairs don't surprise you."
              value={`−${fmt(r.maintenanceMonthly)}`}
              expense
            />
            <ResRow
              label={`CapEx (${pct(inputs.capexPct)} of rent)`}
              hint="Capital Expenditure reserve for major replacements: roof, HVAC, plumbing. These big costs can wipe out years of profit if you haven't saved for them."
              value={`−${fmt(r.capexMonthly)}`}
              expense
            />
            {inputs.otherExpensesMonthly > 0 && (
              <ResRow label="Other Expenses" value={`−${fmt(inputs.otherExpensesMonthly)}`} expense />
            )}
            {inputs.usePropertyManager && (
              <ResRow
                label={`Property Mgmt (${pct(inputs.propertyManagementPct)})`}
                value={`−${fmt(r.propertyManagementMonthly)}`}
                expense
              />
            )}

            <ResRow
              label="Net Operating Income (NOI)"
              hint="Effective gross income minus all operating expenses — NOT including debt service. NOI is the property's income independent of how it's financed. Used to calculate Cap Rate and DSCR."
              value={fmt(r.noi)}
              total
            />

            <div className="res-divider" />

            {initialLoans.length > 1
              ? initialLoans.map(loan => (
                <ResRow
                  key={loan.id}
                  label={`${loan.name} (${loan.isInterestOnly ? 'IO' : 'P&I'})`}
                  value={`−${fmt(calculateLoanPayment(loan))}`}
                  expense
                />
              ))
              : (
                <ResRow
                  label={`Mortgage (${initialLoans[0]?.isInterestOnly ? 'Interest Only' : 'P&I'})`}
                  hint="Monthly principal and interest payment on your loan(s). Stays fixed for the life of a fixed-rate mortgage."
                  value={`−${fmt(r.monthlyMortgage)}`}
                  expense
                />
              )
            }
            {initialLoans.length > 1 && (
              <ResRow
                label="Total Debt Service"
                hint="Sum of all monthly loan payments. This is your total financing cost each month."
                value={`−${fmt(r.monthlyMortgage)}`}
                expense
                total
              />
            )}

            <ResRow label="NET MONTHLY CASH FLOW" value={fmt(r.monthlyCashFlow)} total big />
            <ResRow
              label="Annual Cash Flow"
              hint="Net monthly cash flow × 12. The numerator in your cash-on-cash return calculation."
              value={fmt(r.annualCashFlow)}
            />
          </div>

          <div className="card">
            <h3>Investment Metrics</h3>
            <ResRow
              label="Annual NOI"
              hint="Net Operating Income × 12. The property's annual income after all operating expenses, before debt service. Standard benchmark for comparing investment properties."
              value={fmt(r.annualNOI)}
            />
            <ResRow
              label="Cash-on-Cash Return"
              hint="Annual cash flow ÷ Total cash invested. Measures the annual cash yield on your actual dollars invested. Unlike cap rate, this DOES factor in your financing. Target: 8–12%+."
              value={pct(r.cashOnCash)}
            />
            <ResRow
              label="Cap Rate"
              hint="Annual NOI ÷ Purchase price. The 'all-cash return' of the property, ignoring financing. Useful for comparing properties in the same market. A higher cap rate means higher return but often higher risk or lower-quality location."
              value={pct(r.capRate)}
            />
            <ResRow
              label="Gross Yield"
              hint="Annual gross rent ÷ Purchase price. A quick, rough comparison metric before accounting for expenses or financing. Gross yield of 10%+ is generally considered strong."
              value={pct(r.grossYield)}
            />
            <ResRow
              label="Gross Rent Multiplier (GRM)"
              hint="Purchase price ÷ Annual gross rent. A quick valuation ratio. Lower is better. GRM under 8 is excellent; 8–12 is typical; above 15 means the price is very high relative to the rent it generates. Use to quickly screen deals."
              value={isFinite(r.grm) ? `${r.grm.toFixed(1)}×` : '—'}
            />
            <ResRow
              label="Price-to-Rent Ratio"
              hint="Purchase price ÷ Monthly rent. Under 15 generally favors buying over renting and indicates strong rental demand relative to price. 15–20 is neutral; over 20 suggests the price may be inflated relative to achievable rents."
              value={isFinite(r.priceToRent) ? `${r.priceToRent.toFixed(1)}×` : '—'}
            />
            <ResRow
              label="Operating Expense Ratio"
              hint="Total operating expenses ÷ Effective gross income. Measures how much of your income is consumed by expenses before debt service. Typical range: 35–50%. Lower is more efficient; very low OER (<30%) may mean expenses are underestimated."
              value={pct(r.expenseRatio)}
            />
            <ResRow
              label="Debt Service Coverage (DSCR)"
              hint="NOI ÷ Total monthly debt service. Above 1.0 means NOI covers the mortgage. Most lenders require at least 1.20–1.25 DSCR to approve an investment property loan. Below 1.0 means you'll need extra cash each month."
              value={isFinite(r.dscr) ? r.dscr.toFixed(2) : '—'}
            />
            <ResRow
              label="Break-even Occupancy"
              hint="The occupancy rate at which your income exactly covers all expenses including debt service. If your break-even is 80%, you start losing money when more than 20% of your units are empty. Lower = safer investment."
              value={pct(r.breakEvenOccupancy)}
            />
          </div>

          {r.yearlyProjections.length > 0 && (
            <div className="card">
              <h3>Long-term Projections</h3>
              <p className="card-note">
                {pct(inputs.appreciationRatePct)}/yr appreciation · {pct(inputs.rentGrowthPct)}/yr rent growth ·
                loan balance reflects all active loans at each year ·
                excludes tax benefits
              </p>
              {futureLoans.length > 0 && (
                <p className="card-note" style={{ color: '#2563eb' }}>
                  Future loan events shown as milestone rows (★ marks loan start/payoff years)
                </p>
              )}
              <div className="proj-wrap">
                <table className="proj-table">
                  <thead>
                    <tr>
                      <th>Yr</th>
                      <th>Property Value</th>
                      <th>Loan Balance</th>
                      <th>Equity</th>
                      <th>Rent/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.yearlyProjections.map(p => {
                      const isEvent = (() => {
                        for (const loan of inputs.loans || []) {
                          const sm = parseFloat(loan.startMonth) || 0;
                          const pm = loan.payoffMonth != null ? parseFloat(loan.payoffMonth) : null;
                          if (sm > 0 && sm / 12 === p.year) return true;
                          if (pm !== null && pm / 12 === p.year) return true;
                        }
                        return false;
                      })();
                      return (
                        <tr key={p.year} className={isEvent ? 'proj-event-row' : ''}>
                          <td className="proj-yr">{p.year}{isEvent ? ' ★' : ''}</td>
                          <td>{fmt(p.propertyValue)}</td>
                          <td>{fmt(p.loanBalance)}</td>
                          <td className="proj-equity">{fmt(p.equity)}</td>
                          <td>{fmt(p.monthlyRent)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="disclaimer">
            For informational purposes only. Consult a qualified financial advisor and real estate professional before making investment decisions.
          </p>
        </div>
      </div>

      {/* ── SAVE MODAL ── */}
      {saveModal &&
        createPortal(
          <div className="modal-overlay" onClick={() => setSaveModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h2>{editingId ? 'Edit Deal' : 'Save This Deal'}</h2>
              <p className="modal-sub">
                {editingId
                  ? 'Update the name or notes for this saved deal.'
                  : 'Give this analysis a name so you can compare it later.'}
              </p>
              <label className="modal-label">Deal Name</label>
              <input
                className="modal-input"
                type="text"
                placeholder="e.g. 123 Main St — 3-unit duplex"
                value={dealName}
                onChange={e => setDealName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && commitSave()}
                autoFocus
                maxLength={80}
              />
              <label className="modal-label">
                Notes <span className="modal-label-opt">(optional)</span>
              </label>
              <textarea
                className="modal-textarea"
                placeholder="Address, seller contact, inspection findings, neighborhood notes, anything you want to remember..."
                value={dealNotes}
                onChange={e => setDealNotes(e.target.value)}
                rows={4}
                maxLength={2000}
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setSaveModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={commitSave}
                  disabled={!dealName.trim()}
                >
                  {editingId ? 'Update' : 'Save Deal'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── TUTORIAL MODAL ── */}
      {tutorialOpen && <TutorialModal onClose={() => setTutorialOpen(false)} />}

      {/* ── TOAST ── */}
      {toast && createPortal(
        <div className="toast">{toast}</div>,
        document.body
      )}
    </div>
  );
}

function calcLoanPayment(loan) {
  const amount = parseFloat(loan.amount) || 0;
  const rate = parseFloat(loan.interestRate) || 0;
  const term = parseFloat(loan.termYears) || 0;

  if (amount <= 0 || term <= 0) return 0;

  const r = rate / 100 / 12;

  if (loan.isInterestOnly) return amount * r;
  if (r === 0) return amount / (term * 12);

  const n = term * 12;
  return (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcRawBalance(loan, atMonth) {
  const amount = parseFloat(loan.amount) || 0;
  const rate = parseFloat(loan.interestRate) || 0;
  const term = parseFloat(loan.termYears) || 0;
  const startM = parseFloat(loan.startMonth) || 0;

  if (amount <= 0 || term <= 0 || atMonth < startM) return 0;

  const elapsed = atMonth - startM;
  const totalN = term * 12;
  if (elapsed >= totalN) return 0;
  if (loan.isInterestOnly) return amount;

  const r = rate / 100 / 12;
  const remaining = totalN - elapsed;
  if (r === 0) return amount * (remaining / totalN);

  const pmt = calcLoanPayment(loan);
  return (pmt * (1 - Math.pow(1 + r, -remaining))) / r;
}

export function calculateLoanPayment(loan) {
  return calcLoanPayment(loan);
}

export function calculateLoanBalance(loan, atMonth) {
  const startM = parseFloat(loan.startMonth) || 0;
  const payoffM = loan.payoffMonth != null ? parseFloat(loan.payoffMonth) : null;

  if (atMonth < startM) return 0;
  if (payoffM !== null && atMonth >= payoffM) return 0;

  return calcRawBalance(loan, atMonth);
}

function loansFromLegacy(inputs) {
  const price = parseFloat(inputs.purchasePrice) || 0;
  const downPct = parseFloat(inputs.downPaymentPct) || 20;
  return [
    {
      id: 'legacy',
      name: 'Mortgage',
      type: 'conventional',
      amount: price * (1 - downPct / 100),
      interestRate: parseFloat(inputs.interestRate) || 7.25,
      termYears: parseFloat(inputs.loanTermYears) || 30,
      startMonth: 0,
      payoffMonth: null,
      isInterestOnly: false,
    },
  ];
}

export function calculateResults(inputs) {
  const {
    purchasePrice = 0,
    closingCostsPct = 3,
    buyerAgentPct = 2.5,
    inspectionCost = 0,
    repairCost = 0,
    otherAcquisitionCost = 0,
    rooms = [],
    otherMonthlyIncome = 0,
    vacancyRatePct = 5,
    propertyTaxMonthly = 0,
    insuranceMonthly = 0,
    hoaMonthly = 0,
    maintenancePct = 5,
    utilitiesMonthly = 0,
    capexPct = 5,
    otherExpensesMonthly = 0,
    usePropertyManager = false,
    propertyManagementPct = 10,
    appreciationRatePct = 3,
    rentGrowthPct = 2,
  } = inputs;

  const loans =
    inputs.loans && inputs.loans.length > 0 ? inputs.loans : loansFromLegacy(inputs);

  const n = v => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  const price = n(purchasePrice);

  // Only loans active from day 0 count toward initial financing
  const initialLoans = loans.filter(l => {
    const s = parseFloat(l.startMonth) || 0;
    const p = l.payoffMonth != null ? parseFloat(l.payoffMonth) : null;
    return s === 0 && (p === null || p > 0);
  });

  const totalLoanAmount = initialLoans.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const downPayment = Math.max(0, price - totalLoanAmount);
  const downPaymentPct = price > 0 ? (downPayment / price) * 100 : 0;
  const ltv = price > 0 ? (totalLoanAmount / price) * 100 : 0;
  const loanAmount = totalLoanAmount;

  const closingCosts = price * (n(closingCostsPct) / 100);
  const buyerAgentFee = price * (n(buyerAgentPct) / 100);
  const totalCashInvested =
    downPayment +
    closingCosts +
    buyerAgentFee +
    n(inspectionCost) +
    n(repairCost) +
    n(otherAcquisitionCost);

  const monthlyMortgage = initialLoans.reduce((sum, l) => sum + calcLoanPayment(l), 0);

  const roomsRent = rooms.reduce((sum, r) => sum + n(r.monthlyRent), 0);
  const grossMonthlyRent = roomsRent + n(otherMonthlyIncome);
  const vacancyLoss = grossMonthlyRent * (n(vacancyRatePct) / 100);
  const effectiveGrossIncome = grossMonthlyRent - vacancyLoss;

  const maintenanceMonthly = grossMonthlyRent * (n(maintenancePct) / 100);
  const capexMonthly = grossMonthlyRent * (n(capexPct) / 100);
  const propertyManagementMonthly = usePropertyManager
    ? effectiveGrossIncome * (n(propertyManagementPct) / 100)
    : 0;
  const totalOperatingExpenses =
    n(propertyTaxMonthly) +
    n(insuranceMonthly) +
    n(hoaMonthly) +
    maintenanceMonthly +
    n(utilitiesMonthly) +
    capexMonthly +
    n(otherExpensesMonthly) +
    propertyManagementMonthly;

  const noi = effectiveGrossIncome - totalOperatingExpenses;
  const monthlyCashFlow = noi - monthlyMortgage;
  const annualCashFlow = monthlyCashFlow * 12;
  const annualNOI = noi * 12;
  const annualGrossRent = grossMonthlyRent * 12;

  const cashOnCash = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;
  const capRate = price > 0 ? (annualNOI / price) * 100 : 0;
  const grm = annualGrossRent > 0 ? price / annualGrossRent : 0;
  const priceToRent = grossMonthlyRent > 0 ? price / grossMonthlyRent : 0;
  const grossYield = price > 0 ? (annualGrossRent / price) * 100 : 0;
  const dscr = monthlyMortgage > 0 ? noi / monthlyMortgage : 0;
  const totalMonthlyObligations = totalOperatingExpenses + monthlyMortgage;
  const breakEvenOccupancy =
    grossMonthlyRent > 0 ? (totalMonthlyObligations / grossMonthlyRent) * 100 : 0;
  const expenseRatio =
    effectiveGrossIncome > 0 ? (totalOperatingExpenses / effectiveGrossIncome) * 100 : 0;

  // Build milestone years — always include 5/10/20/30 plus any whole-year loan events
  const eventYears = new Set([5, 10, 20, 30]);
  for (const loan of loans) {
    const sm = parseFloat(loan.startMonth) || 0;
    const pm = loan.payoffMonth != null ? parseFloat(loan.payoffMonth) : null;
    if (sm > 0 && sm % 12 === 0) eventYears.add(sm / 12);
    if (pm !== null && pm % 12 === 0) eventYears.add(pm / 12);
  }
  const milestoneYears = [...eventYears].filter(y => y <= 40).sort((a, b) => a - b);

  const yearlyProjections = milestoneYears.map(year => {
    const atMonth = year * 12;
    const propertyValue = price * Math.pow(1 + n(appreciationRatePct) / 100, year);
    const loanBalance = loans.reduce((sum, l) => sum + calculateLoanBalance(l, atMonth), 0);
    const equity = propertyValue - loanBalance;
    const monthlyRentThen = grossMonthlyRent * Math.pow(1 + n(rentGrowthPct) / 100, year);
    return { year, propertyValue, loanBalance, equity, monthlyRent: monthlyRentThen };
  });

  return {
    downPayment,
    downPaymentPct,
    loanAmount,
    totalLoanAmount,
    ltv,
    closingCosts,
    buyerAgentFee,
    totalCashInvested,
    monthlyMortgage,
    grossMonthlyRent,
    vacancyLoss,
    effectiveGrossIncome,
    maintenanceMonthly,
    capexMonthly,
    propertyManagementMonthly,
    totalOperatingExpenses,
    noi,
    monthlyCashFlow,
    annualCashFlow,
    annualNOI,
    annualGrossRent,
    cashOnCash,
    capRate,
    grm,
    priceToRent,
    grossYield,
    dscr,
    breakEvenOccupancy,
    expenseRatio,
    yearlyProjections,
  };
}

export function calculateMortgagePayment(principal, annualRate, termYears) {
  if (principal <= 0 || termYears <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const n = termYears * 12;
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
}

export function calculateResults(inputs) {
  const {
    purchasePrice = 0,
    downPaymentPct = 20,
    interestRate = 7,
    loanTermYears = 30,
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

  const n = v => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);

  // Purchase
  const price = n(purchasePrice);
  const downPayment = price * (n(downPaymentPct) / 100);
  const loanAmount = price - downPayment;
  const ltv = price > 0 ? (loanAmount / price) * 100 : 0;
  const closingCosts = price * (n(closingCostsPct) / 100);
  const buyerAgentFee = price * (n(buyerAgentPct) / 100);
  const totalCashInvested = downPayment + closingCosts + buyerAgentFee + n(inspectionCost) + n(repairCost) + n(otherAcquisitionCost);

  // Mortgage
  const monthlyMortgage = calculateMortgagePayment(loanAmount, n(interestRate), n(loanTermYears));

  // Income
  const roomsRent = rooms.reduce((sum, r) => sum + n(r.monthlyRent), 0);
  const grossMonthlyRent = roomsRent + n(otherMonthlyIncome);
  const vacancyLoss = grossMonthlyRent * (n(vacancyRatePct) / 100);
  const effectiveGrossIncome = grossMonthlyRent - vacancyLoss;

  // Expenses
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

  // Return metrics
  const cashOnCash = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;
  const capRate = price > 0 ? (annualNOI / price) * 100 : 0;
  const grm = annualGrossRent > 0 ? price / annualGrossRent : 0;
  const priceToRent = grossMonthlyRent > 0 ? price / grossMonthlyRent : 0;
  const grossYield = price > 0 ? (annualGrossRent / price) * 100 : 0;
  const dscr = monthlyMortgage > 0 ? noi / monthlyMortgage : 0;
  const totalMonthlyObligations = totalOperatingExpenses + monthlyMortgage;
  const breakEvenOccupancy = grossMonthlyRent > 0 ? (totalMonthlyObligations / grossMonthlyRent) * 100 : 0;

  // Expense ratio
  const expenseRatio = effectiveGrossIncome > 0 ? (totalOperatingExpenses / effectiveGrossIncome) * 100 : 0;

  // Long-term projections
  const yearlyProjections = [];
  const monthlyRate = n(interestRate) / 100 / 12;
  const totalPayments = n(loanTermYears) * 12;

  for (const year of [5, 10, 20, 30]) {
    if (year > n(loanTermYears)) continue;
    const propertyValue = price * Math.pow(1 + n(appreciationRatePct) / 100, year);
    const paymentsLeft = totalPayments - year * 12;
    let loanBalance = 0;
    if (monthlyRate > 0 && paymentsLeft > 0) {
      loanBalance = monthlyMortgage * (1 - Math.pow(1 + monthlyRate, -paymentsLeft)) / monthlyRate;
    }
    const equity = propertyValue - loanBalance;
    const monthlyRentThen = grossMonthlyRent * Math.pow(1 + n(rentGrowthPct) / 100, year);

    yearlyProjections.push({ year, propertyValue, loanBalance, equity, monthlyRent: monthlyRentThen });
  }

  return {
    downPayment,
    loanAmount,
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

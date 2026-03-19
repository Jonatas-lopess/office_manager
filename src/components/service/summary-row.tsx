
interface SummaryRowProps {
  label: string;
  value: string;
  testId: string;
}

export function SummaryRow({ label, value, testId }: SummaryRowProps) {
  return (
    <div
      className="flex items-center justify-between"
      data-testid={`row-summary-${testId}`}
    >
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-summary-label-${testId}`}
      >
        {label}
      </div>
      <div
        className="text-sm font-semibold"
        data-testid={`text-summary-value-${testId}`}
      >
        {value}
      </div>
    </div>
  );
}

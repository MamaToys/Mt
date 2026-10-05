import { requireStore } from "@/lib/session";
import { db } from "@/lib/db";
import { fromDbDate, todayIn } from "@/lib/metrics/dates";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dash/notices";
import { deleteExpense } from "@/app/actions";
import { ExpenseForm } from "./expense-form";

export const dynamic = "force-dynamic";

const BASE_LABEL = { NET_SALES: "net sales", GROSS_SALES: "gross sales", TOTAL_SALES: "total sales", META_SPEND: "Meta spend" } as const;

export default async function ExpensesPage() {
  const { store } = await requireStore();
  const expenses = await db.expense.findMany({ where: { storeId: store.id }, orderBy: [{ startDate: "desc" }] });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Expenses" description={`Costs beyond product cost and Meta spend, in ${store.currency}. They are allocated per day and subtracted in net profit.`} />
      <Card>
        <CardHeader>
          <CardTitle>Add expense</CardTitle>
          <CardDescription>
            Fixed: one-time (on its date), daily, or monthly (spread evenly over the days of each month). Percentage: % of net sales, gross sales, total sales or Meta spend each day.
            Percentage-of-sales expenses lower the contribution margin (break-even ROAS); % of Meta spend (e.g. agency fees) raises the break-even ROAS directly.
          </CardDescription>
        </CardHeader>
        <CardContent><ExpenseForm today={todayIn(store.timezone)} currency={store.currency} /></CardContent>
      </Card>
      <Card className="p-2">
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Category</TH><TH>Type</TH><TH>Amount</TH><TH>From</TH><TH>To</TH><TH>Notes</TH><TH /></TR>
          </THead>
          <TBody>
            {expenses.length === 0 && <TR><TD colSpan={8} className="py-6 text-center text-muted-foreground">No expenses yet.</TD></TR>}
            {expenses.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">{e.name}</TD>
                <TD><Badge variant="outline">{e.category.replace(/_/g, " ").toLowerCase()}</Badge></TD>
                <TD className="text-xs">{e.type === "FIXED" ? e.frequency.replace("_", "-").toLowerCase() : "percentage"}</TD>
                <TD>{e.type === "FIXED" ? `${formatMoney(Number(e.amount), e.currency)}${e.frequency === "MONTHLY" ? " / month" : e.frequency === "DAILY" ? " / day" : ""}` : `${Number(e.percent)}% of ${BASE_LABEL[e.percentBase!]}`}</TD>
                <TD>{fromDbDate(e.startDate)}</TD>
                <TD>{e.frequency === "ONE_TIME" ? "—" : e.endDate ? fromDbDate(e.endDate) : "ongoing"}</TD>
                <TD className="max-w-48 truncate text-xs text-muted-foreground">{e.notes}</TD>
                <TD>
                  <form action={deleteExpense.bind(null, e.id)}><button className="text-xs text-critical underline" type="submit">Delete</button></form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

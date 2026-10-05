"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { saveExpense } from "@/app/actions";

const CATEGORIES = ["GOOGLE_ADS", "TIKTOK_ADS", "OTHER_ADVERTISING", "INFLUENCER", "AGENCY", "SOFTWARE", "WAREHOUSE", "PACKAGING", "SHIPPING", "PAYMENT_FEES", "SALARIES", "OTHER"];

export function ExpenseForm({ today, currency }: { today: string; currency: string }) {
  const [type, setType] = useState("FIXED");
  const [freq, setFreq] = useState("MONTHLY");
  return (
    <ActionForm action={saveExpense} submitLabel="Add expense" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name"><Input name="name" required maxLength={120} placeholder="e.g. Google Ads" /></Field>
        <Field label="Category">
          <NativeSelect name="category" defaultValue="OTHER">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase()}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Type">
          <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="FIXED">Fixed amount</option>
            <option value="PERCENTAGE">Percentage</option>
          </NativeSelect>
        </Field>
        <Field label="Frequency">
          <NativeSelect name="frequency" value={freq} onChange={(e) => setFreq(e.target.value)}>
            <option value="ONE_TIME">One-time</option>
            <option value="DAILY">Daily</option>
            <option value="MONTHLY">Monthly</option>
          </NativeSelect>
        </Field>
        {type === "FIXED" ? (
          <Field label={`Amount (${currency})${freq === "MONTHLY" ? " per month" : freq === "DAILY" ? " per day" : ""}`}>
            <Input name="amount" type="number" step="0.01" min="0" required />
          </Field>
        ) : (
          <>
            <Field label="Percent (%)"><Input name="percent" type="number" step="0.01" min="0" max="100" required /></Field>
            <Field label="Percentage of">
              <NativeSelect name="percentBase" defaultValue="NET_SALES">
                <option value="NET_SALES">Net sales</option>
                <option value="GROSS_SALES">Gross sales</option>
                <option value="TOTAL_SALES">Total sales</option>
                <option value="META_SPEND">Meta spend</option>
              </NativeSelect>
            </Field>
          </>
        )}
        <Field label={freq === "ONE_TIME" ? "Date" : "Start date"}><Input name="startDate" type="date" defaultValue={today} required /></Field>
        {freq !== "ONE_TIME" && <Field label="End date (optional)"><Input name="endDate" type="date" /></Field>}
        <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} /></Field>
      </div>
    </ActionForm>
  );
}

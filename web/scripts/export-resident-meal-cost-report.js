const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function money(value, currency = "GBP") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

async function main() {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local.",
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("recipe_costings")
    .select(
      "recipe_id, recipe_title, recipe_collection, recipe_portions, total_cost, cost_per_portion, currency, updated_at",
    )
    .not("cost_per_portion", "is", null)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((row) => ({
      ...row,
      total_cost: Number(row.total_cost ?? 0),
      cost_per_portion: Number(row.cost_per_portion ?? 0),
      recipe_portions:
        row.recipe_portions === null || row.recipe_portions === undefined
          ? null
          : Number(row.recipe_portions),
      currency: row.currency || "GBP",
    }))
    .filter((row) => Number.isFinite(row.cost_per_portion));

  if (!rows.length) {
    throw new Error("No costed recipes with cost_per_portion were found.");
  }

  const costs = rows.map((row) => row.cost_per_portion);
  const residentRows = rows.filter((row) => row.recipe_collection === "Dining");
  const residentCosts = residentRows.length
    ? residentRows.map((row) => row.cost_per_portion)
    : costs;
  const currency = rows[0].currency || "GBP";
  const sampleRows = [...residentRows]
    .sort((a, b) => a.cost_per_portion - b.cost_per_portion)
    .slice(0, 30);

  const report = [
    "# Resident Meal Cost Per Cover - Recipe Costing Snapshot",
    "",
    `Prepared from ${rows.length} saved recipe costing records in the recipe platform.`,
    `Resident/Dining records used for the headline average: ${residentRows.length || rows.length}.`,
    "",
    "## Summary",
    "",
    `- Average resident meal cost per cover: **${money(average(residentCosts), currency)}**`,
    `- Median resident meal cost per cover: **${money(median(residentCosts), currency)}**`,
    `- Typical resident range, middle 80%: **${money(percentile(residentCosts, 0.1), currency)} to ${money(
      percentile(residentCosts, 0.9),
      currency,
    )}**`,
    `- Lowest resident costed cover in sample: **${money(Math.min(...residentCosts), currency)}**`,
    `- Highest resident costed cover in sample: **${money(Math.max(...residentCosts), currency)}**`,
    `- Overall average across all costed recipe records: **${money(average(costs), currency)}**`,
    "",
    "These figures are indicative only. The actual cost per cover will vary depending on the daily menu, portion sizes, ingredient pricing, recipe mix, and any substitutions made during service.",
    "",
    "## Sample Resident/Dining Costed Recipes",
    "",
    "| Recipe | Collection | Portions | Total recipe cost | Cost per cover | Last updated |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...sampleRows.map(
      (row) =>
        `| ${String(row.recipe_title ?? "Untitled").replace(/\|/g, "/")} | ${row.recipe_collection ?? "-"} | ${
          row.recipe_portions ?? "-"
        } | ${money(row.total_cost, row.currency)} | ${money(
          row.cost_per_portion,
          row.currency,
        )} | ${formatDate(row.updated_at)} |`,
    ),
    "",
    "## Suggested Reply",
    "",
    "Hi,",
    "",
    `Based on the resident/Dining recipes currently costed in the platform, the average resident meal cost is approximately **${money(
      average(residentCosts),
      currency,
    )} per cover**. This is only an indicative average, as the final cost will vary depending on the dishes served on the day, ingredient pricing, portion sizes, and any substitutions.`,
    "",
    "I have included a sample of costed recipes below to show the basis of the calculation.",
    "",
    "Kind regards,",
    "Paulino",
    "",
  ].join("\n");

  const outputPath = path.join(process.cwd(), "docs", "resident-meal-cost-report.md");
  fs.writeFileSync(outputPath, report);

  console.log(`Wrote ${outputPath}`);
  console.log(`Costed recipes: ${rows.length}`);
  console.log(`Resident/Dining costed recipes: ${residentRows.length || rows.length}`);
  console.log(`Average resident cost per cover: ${money(average(residentCosts), currency)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

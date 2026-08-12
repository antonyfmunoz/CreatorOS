const secret = process.env.DISTRIBUTION_DISPATCH_SECRET;
if (!secret) throw new Error("DISTRIBUTION_DISPATCH_SECRET is required");

const response = await fetch("http://127.0.0.1:3000/api/internal/operations/backup", {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Production backup trigger failed with ${response.status}`);

process.stdout.write(`${JSON.stringify(body)}\n`);

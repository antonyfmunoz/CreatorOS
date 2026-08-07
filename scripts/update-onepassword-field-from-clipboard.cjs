#!/usr/bin/env node
/*
 * Receives a revealed 1Password item JSON document on stdin, replaces one
 * named field with the current Windows clipboard text, then writes the item
 * JSON to stdout for `op item edit`. It deliberately never logs or persists
 * the clipboard value.
 */
const { execFileSync } = require("child_process");
const { randomUUID } = require("crypto");

const fieldLabel = process.argv[2];
if (!fieldLabel || !/^[A-Z0-9_]{2,80}$/.test(fieldLabel)) {
  process.stderr.write("Provide a valid uppercase 1Password field label.\n");
  process.exit(2);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    // PowerShell may prefix piped UTF-8 JSON with a byte-order mark.
    // Strip it without touching any of the protected field values.
    const item = JSON.parse(input.replace(/^\uFEFF/, ""));
    const clipboard = execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], { encoding: "utf8" }).trim();
    if (!clipboard) throw new Error("The clipboard is empty");
    let field = item.fields?.find((candidate) => candidate.label === fieldLabel);
    if (!field) {
      field = {
        id: randomUUID(),
        label: fieldLabel,
        type: "CONCEALED",
        value: "",
      };
      item.fields ??= [];
      item.fields.push(field);
    }
    field.value = clipboard;
    process.stdout.write(JSON.stringify(item));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Unable to update the protected field"}\n`);
    process.exit(1);
  }
});

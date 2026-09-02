# Exact-release render failure evidence

Deployment run 33613869521 attempt 1 failed its unchanged full browser gate:
the mobile programmable-cinema render stayed running beyond 60 seconds and its
retry received a connection reset earlier in the journey. Desktop native text
layout passed on retry after one queued-state timeout. Neither symptom alone
establishes the underlying cause. No test timeout or required gate was relaxed.

The next source increment retains bounded render-state histories with private
URLs redacted, and uploads synthetic Playwright failure evidence for seven days
when exact-release qualification fails. The existing 60-second render wait stays
unchanged. Callers still require a completed artifact. This is diagnostic
coverage, not a claim that the intermittent failure is fixed.

Local qualification: both journeys passed on mobile and desktop, 4/4 in 4.8
minutes, with no retries. Logs are `render-diagnostics-browser.log` and
`render-diagnostics-browser-error.log` under `B:/CreativesOS-task-artifacts`.
Run 33613869521 attempt 2 repeats the original exact source and full protected
qualification. Its outcome and production artifact proof remain separate gates.

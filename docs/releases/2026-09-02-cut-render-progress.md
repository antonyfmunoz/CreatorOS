# Native render progress and reliability evidence

The native application's FFmpeg path now reports allowlisted numeric frame,
output-time and speed information. Durable updates are limited to one in flight
and normally one per five seconds, retain the running-job lease check and never
report an artifact as complete merely because the encoder emitted `progress=end`.
Progress stays below completion until the existing artifact persistence and
job-finalization path succeeds. Logs do not copy FFmpeg source URLs or stderr.

This work follows protected run `33637334398`, where the programmable-cinema
desktop journey first exceeded its existing 60-second render wait and then passed
on retry. Job `7b516d5c-b8d8-4ddc-aacb-6184ccc036e6` only reported Starting and
Rendering multitrack edit before the timeout. That is insufficient to establish
whether the encoder was stalled or merely slow. The cause is **not declared
fixed** by adding progress reporting. No timeout, assertion, CI retry policy or
security gate is weakened.

Parser tests cover chunking, malformed/private input, record boundaries and
bounded state. A real-encoder browser-qualification test compares reported
frames/time against a retained video, its decoded frame count and actual RGB
pixels. Qualification, protected checks and production deployment remain pending
for this candidate until their separate receipts are recorded.

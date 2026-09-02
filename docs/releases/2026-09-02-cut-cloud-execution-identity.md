# Cloud execution identity follow-through

The actual prior production worker reported `localhost:1:cut`. Separate Cloud
Run job containers may share that hostname/PID, so that fallback cannot safely
identify their independent registry rows. The native worker now incorporates
Google's injected execution name, task index, retry attempt and process ID.
Incomplete Cloud identity fails closed. Local fallback and explicit operator
IDs remain unchanged; operators must still keep explicit overrides unique.

Successful durable claims emit only event, job ID, worker ID and kind. Lease
tokens, private URLs, request/source content and credentials are excluded. This
allows later production evidence to bind a particular claimed job to a logged
execution directly, rather than relying only on the dispatch operation.

Reference: [Google Cloud Run job environment contract](https://docs.cloud.google.com/run/docs/container-contract#jobs-env-vars).
Focused tests, actual database qualification, protected source and deployed
worker identity must all pass before this candidate closes the production gap.

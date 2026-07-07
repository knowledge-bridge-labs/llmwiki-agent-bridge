# Examples

Start a local `llmwiki-serve` source on `127.0.0.1:8765`, then post the sample
request to a bridge listening on `127.0.0.1:8788`:

```sh
curl -s http://127.0.0.1:8788/message:send \
  -H 'content-type: application/json' \
  --data @examples/message-send.local.json
```

The response should include a text answer and a `llmwiki_agent_result` artifact
with citations, graph context, and trace steps. See
[Message Send Contract](../docs/message-send-contract.md) for the full request,
source descriptor, response, and failure shapes.

The sample JSON is intentionally pinned to the default source URL
`http://127.0.0.1:8765`. If you start `llmwiki-serve` or the bridge on a
different port, copy `examples/message-send.local.json` to a temporary file and
replace the `knowledgeSources[0].url` value before posting it to the chosen
bridge URL.

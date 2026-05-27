# State Spike Checklist

Goal: validate where BOS data can be safely stored in the current Paperclip runtime.

## Test 1 - Company-scoped state

1. Write key: `bos_state_spike_company` using company scope.
2. Read it back immediately.
3. Restart plugin worker.
4. Read it back again.
5. Repeat in a second company to confirm isolation.

Expected:

- If reliable: may use company scope for non-durable cached config.
- If unreliable: use config JSON / managed native resources.

## Test 2 - Issue-scoped state

1. Write `bpi_score` to issue scope.
2. Read it from issue detail/data provider.
3. Restart plugin.
4. Read it again.

Expected:

- Issue-scoped state can be primary overlay if stable.
- Mirror important values to issue document/comment.

## Test 3 - Config JSON fallback

1. Store BOS config map in plugin config JSON.
2. Patch config.
3. Read config.
4. Restart plugin.
5. Read config again.

Expected:

- Config JSON is fallback for company-scoped config.

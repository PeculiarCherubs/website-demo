# Stage 5 — Chapel Scope Validation Root-Cause Fix

## Root cause

`validateChapelKeys` is defined as:

```js
validateChapelKeys(env, keys)
```

but both scope-writing call sites invoked it as:

```js
validateChapelKeys(requestChapelKeys(body))
```

The selected chapel array was therefore being passed into the `env` parameter,
while `keys` became `undefined`.

Because `validateChapelKeys` returned `[]` immediately for an empty/undefined
`keys` argument, the mistake was silent. The next step, `normalizeScope`, then
correctly rejected the empty array with:

```text
chapel_scope_required
```

This affected both:

- creating a new Chapel Content Manager invitation; and
- saving scopes for an existing/pending administrator.

## Fix

Both calls now pass:

```js
validateChapelKeys(env, requestChapelKeys(body))
```

The validator also explicitly fails with
`cms_scope_validation_unavailable` if a D1 environment is not supplied, so this
class of wiring error cannot silently masquerade as an empty chapel selection
again.

A runtime regression test now exercises both invitation and existing-admin
scope persistence using a D1-like fake, and verifies that invalid chapel IDs
still fail closed.

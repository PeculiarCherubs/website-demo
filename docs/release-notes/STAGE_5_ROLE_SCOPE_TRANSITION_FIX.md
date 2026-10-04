# Stage 5 — Role + Scope Transition Fix

Changing an existing or pending Super Admin to Chapel Content Manager previously
changed the role separately from the required chapel/HQ scope.

The transition is now handled as one workflow:

1. selecting Chapel Content Manager opens the scope picker;
2. the current role is not committed yet;
3. one or more chapel/HQ scopes are selected;
4. role + scope are submitted together;
5. the Worker validates the scope keys;
6. D1 persists the role and scopes together.

Pending invitations use the same role+scope payload.

Global roles continue to receive the canonical `global/*` scope automatically.

The last-active-Super-Admin safeguard remains intentional: the final active
Super Admin cannot be demoted until another active Super Admin exists.

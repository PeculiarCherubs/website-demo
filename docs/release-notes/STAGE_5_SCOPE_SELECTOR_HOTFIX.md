# Stage 5 — Chapel Scope Selector Hotfix

Fixes `chapel_scope_required` during Chapel Content Manager assignment.

The previous Admin Access interface used a native HTML multi-select and expected
`selectedOptions`. The control was easy to miss and awkward on touch devices.

The add-admin form and scope-edit modal now render explicit checkboxes from the
canonical chapel/HQ registry. Peculiar HQ and all current chapels can be
selected directly, one or many, without Ctrl/Cmd.

Backend validation remains unchanged: a Chapel Content Manager must still have
at least one valid canonical scope.

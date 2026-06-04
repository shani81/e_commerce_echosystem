/**
 * Pure RBAC permission matcher (extracted from RolesGuard so it's unit-testable
 * without a request context). A granted set satisfies a required permission when
 * it contains a global wildcard (`*` or `*:*` — seeded owner/super-admin), the
 * exact grant, or the resource wildcard (`resource:*`).
 */
export function isPermissionGranted(
  required: string,
  granted: ReadonlySet<string>,
): boolean {
  if (granted.has('*') || granted.has('*:*')) return true;
  if (granted.has(required)) return true;
  const [resource] = required.split(':');
  return granted.has(`${resource}:*`);
}

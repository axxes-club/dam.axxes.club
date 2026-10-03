/** Personal/shared personal library keys are not organization UUIDs. */
export function organizationId(value:string):string|null{return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null}

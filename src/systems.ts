export const SYSTEMS = ['earth-moon-l2', 'sun-earth-l1', 'bicircular-l1-horizontal', 'bicircular-l1-vertical'];
export const systemOf = (value: string | null | undefined): string => (value && SYSTEMS.includes(value) ? value : SYSTEMS[0]);

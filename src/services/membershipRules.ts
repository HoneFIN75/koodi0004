export const MEMBERSHIP_BANDS = [
  { label: 'Ei jäseniä', min: 0, max: 0, votes: 0 },
  { label: 'Jäseniä 1–99', min: 1, max: 99, votes: 10 },
  { label: 'Jäseniä 100–299', min: 100, max: 299, votes: 15 },
  { label: 'Jäseniä 300–499', min: 300, max: 499, votes: 20 },
  { label: 'Jäseniä 500+', min: 500, max: Number.POSITIVE_INFINITY, votes: 25 },
] as const;

export const VOTING_POWERS = MEMBERSHIP_BANDS.map(({ votes }) => votes);

export function getMembershipBand(members: number | null) {
  if (members === null || !Number.isSafeInteger(members) || members < 0) return null;
  return MEMBERSHIP_BANDS.find(({ min, max }) => members >= min && members <= max) ?? null;
}

export function getVotingPower(members: number | null): number | null {
  return getMembershipBand(members)?.votes ?? null;
}

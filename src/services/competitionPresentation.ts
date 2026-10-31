export function formatCompetitionDivision(value: string): string {
  const labels: Record<string, string> = {
    mixed: 'Pro- ja amatööriluokat',
    pro: 'Pro-luokat',
    am: 'Amatööriluokat',
    amateur: 'Amatööriluokat',
    'Rating-luokat': 'Luokitukseen perustuvat luokat',
    'Pro- ja amatööriluokat, Vain pro-luokkia': 'Pro- ja amatööriluokat; lähde rajaa lisäksi vain pro-luokkiin (ristiriitainen luokkajako)',
  };
  if (Object.hasOwn(labels, value)) return labels[value];
  if (value.includes('Rating-perusteiset luokat')) {
    const qualifier = value.startsWith('Vain amatööriluokkia') ? 'Amatööriluokat · '
      : value.startsWith('Vain pro-luokkia') ? 'Pro-luokat · '
        : value.startsWith('Pro- ja amatööriluokat') ? 'Pro- ja amatööriluokat · ' : '';
    return `${qualifier}Luokitukseen perustuvat luokat: kulta, sininen, valkoinen, punainen, vihreä ja violetti`;
  }
  return value || 'Luokkajako puuttuu';
}

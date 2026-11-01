import { COMPETITION_FILE, type CompetitionIndex } from '../models/competition.ts';
import { indexCompetitions, parseCompetitions } from '../services/competitionService.ts';

export function createCompetitionRepository(url: string, fetcher: typeof fetch = fetch) {
  return {
    async getIndex(signal?: AbortSignal): Promise<CompetitionIndex> {
      const response = await fetcher(url, { cache: 'no-store', signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Kilpailuaineiston lataus epäonnistui (HTTP ${response.status}).`);
      let payload: unknown;
      try { payload = await response.json(); }
      catch (cause) { throw new Error('Kilpailuaineisto ei ole kelvollista JSONia.', { cause }); }
      return indexCompetitions(parseCompetitions(payload));
    },
  };
}

export const competitionRepository = createCompetitionRepository(`${import.meta.env?.BASE_URL ?? './'}${COMPETITION_FILE}`);

import { useStore } from 'zustand';
import { plannerStore, type PlannerState } from './plannerStore';
import { activeScenario } from '../services/plannerDocument';

export const usePlanner = <T,>(selector: (state: PlannerState) => T): T => useStore(plannerStore, selector);
export const useDocument = () => usePlanner((state) => state.history.present);
export const useActiveScenario = () => usePlanner((state) => activeScenario(state.history.present));
export const plannerActions = () => plannerStore.getState();

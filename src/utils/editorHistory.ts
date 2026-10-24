export interface EditorHistory<T> { entries: T[][]; index: number }
export type EditorHistoryAction<T> = { type: 'push'; value: T[] | ((current: T[]) => T[]) } | { type: 'reset'; value: T[] } | { type: 'undo' } | { type: 'redo' };

export function reduceEditorHistory<T>(state: EditorHistory<T>, action: EditorHistoryAction<T>): EditorHistory<T> {
  if (action.type === 'reset') return { entries: [action.value], index: 0 };
  if (action.type === 'undo') return state.index > 0 ? { ...state, index: state.index - 1 } : state;
  if (action.type === 'redo') return state.index < state.entries.length - 1 ? { ...state, index: state.index + 1 } : state;
  const current = state.entries[state.index];
  const next = typeof action.value === 'function' ? action.value(current) : action.value;
  return { entries: [...state.entries.slice(0, state.index + 1), next], index: state.index + 1 };
}

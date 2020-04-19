import 'reactn';
import { Board } from './BoardService';
declare module 'reactn/default' {

  export interface Reducers {

    append: (
      global: State,
      dispatch: Dispatch,
      ...strings: any[]
    ) => Pick<State, 'board'>;

    increment: (
      global: State,
      dispatch: Dispatch,
      i: number,
    ) => Pick<State, 'board'>;

    doNothing: (
      global: State,
      dispatch: Dispatch,
    ) => null;
  }

  export interface State {
    board: Board;
  }
}

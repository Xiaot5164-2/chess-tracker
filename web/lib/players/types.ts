export type AddPlayerState = {
  ok: boolean;
  message: string;
};

export const addPlayerInitialState: AddPlayerState = { ok: false, message: "" };

export type DeleteStudentState = {
  ok: boolean;
  message: string;
};

export const deleteStudentInitialState: DeleteStudentState = { ok: false, message: "" };

export type UpdateDisplayNameState = {
  ok: boolean;
  message: string;
};

export const updateDisplayNameInitialState: UpdateDisplayNameState = { ok: false, message: "" };

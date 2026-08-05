export type ComposerKeyboardEventLike = {
  defaultPrevented?: boolean;
  isComposing?: boolean;
  key: string;
  keyCode?: number;
  shiftKey?: boolean;
};

export const isHostInputCompositionEvent = (
  event: ComposerKeyboardEventLike,
) => event.isComposing === true || event.keyCode === 229;

export const shouldSubmitComposerKey = (
  event: ComposerKeyboardEventLike,
) =>
  event.key === "Enter" &&
  event.shiftKey !== true &&
  event.defaultPrevented !== true &&
  !isHostInputCompositionEvent(event);

export const shouldCancelPendingActionKey = (
  event: ComposerKeyboardEventLike,
  targetIsEditable: boolean,
) =>
  event.key === "Escape" &&
  event.defaultPrevented !== true &&
  !targetIsEditable &&
  !isHostInputCompositionEvent(event);

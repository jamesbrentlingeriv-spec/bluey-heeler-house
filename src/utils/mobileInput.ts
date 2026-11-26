export const mobileInput = {
  moveX: 0,
  moveForward: 0,
  jumpQueuedAt: 0,
};

export const resetMobileInput = () => {
  mobileInput.moveX = 0;
  mobileInput.moveForward = 0;
  mobileInput.jumpQueuedAt = 0;
};

let currentUserId: string | undefined;

export const setUserId = (id: string) => {
  currentUserId = id;
};

export const getUserId = () => currentUserId;

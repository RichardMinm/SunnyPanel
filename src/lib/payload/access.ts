import type { Access, PayloadRequest, Where } from "payload";

const buildPublicContentConstraint = (): Where => ({
  and: [
    {
      status: {
        equals: "published",
      },
    },
    {
      visibility: {
        equals: "public",
      },
    },
  ],
});

export const publicContentConstraint = buildPublicContentConstraint;

export const canAccessAdmin = ({ req }: { req: PayloadRequest }) => Boolean(req.user);

export const adminsOnly: Access = ({ req }) => Boolean(req.user);

export const adminsOrPublished: Access = ({ req }) => {
  if (req.user) {
    return true;
  }

  return buildPublicContentConstraint();
};

export const adminsOrPublicMedia: Access = ({ req }) => {
  if (req.user) {
    return true;
  }

  return {
    visibility: {
      equals: "public",
    },
  };
};

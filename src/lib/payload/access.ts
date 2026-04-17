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

export const adminsOrFirstUser: Access = async ({ req }) => {
  if (req.user) {
    return true;
  }

  const existingUsers = await req.payload.find({
    collection: "users",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
  });

  return existingUsers.totalDocs === 0;
};

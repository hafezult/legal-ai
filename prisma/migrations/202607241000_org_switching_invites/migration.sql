-- Active organization selection and pending email invites for pre-signup members.
ALTER TABLE "User"
ADD COLUMN "activeOrganizationId" TEXT;

CREATE INDEX "User_activeOrganizationId_idx" ON "User"("activeOrganizationId");

ALTER TABLE "User"
ADD CONSTRAINT "User_activeOrganizationId_fkey"
FOREIGN KEY ("activeOrganizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrganizationInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationInvite_token_key" ON "OrganizationInvite"("token");

CREATE INDEX "OrganizationInvite_email_idx" ON "OrganizationInvite"("email");

CREATE INDEX "OrganizationInvite_invitedByUserId_idx" ON "OrganizationInvite"("invitedByUserId");

CREATE UNIQUE INDEX "OrganizationInvite_organizationId_email_key"
ON "OrganizationInvite"("organizationId", "email");

ALTER TABLE "OrganizationInvite"
ADD CONSTRAINT "OrganizationInvite_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvite"
ADD CONSTRAINT "OrganizationInvite_invitedByUserId_fkey"
FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

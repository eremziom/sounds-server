-- Abort if existing names violate the login rule; never rename accounts silently.
ALTER TABLE "User"
ADD CONSTRAINT "User_username_no_at" CHECK (position('@' in "username") = 0);

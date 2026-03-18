"""add login_name to users

Revision ID: f9b2c4d6e8a1
Revises: db0aca1ebd32
Create Date: 2026-03-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f9b2c4d6e8a1"
down_revision = "db0aca1ebd32"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("login_name", sa.String(length=320), nullable=True))
    op.create_index("users_org_id_login_name", "users", ["org_id", "login_name"], unique=False)

    op.execute(
        """
        UPDATE users
        SET login_name = lower(trim(name))
        WHERE login_name IS NULL AND name IS NOT NULL
        """
    )


def downgrade():
    op.drop_index("users_org_id_login_name", table_name="users")
    op.drop_column("users", "login_name")

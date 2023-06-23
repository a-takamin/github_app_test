#!/bin/sh

aws ssm put-parameter --name "/CHECK_RUN_TEST/WEBHOOK_SECRET" --value "dummy" --type "SecureString" --no-overwrite
aws ssm put-parameter --name "/CHECK_RUN_TEST/GITHUB_APP_ID" --value "dummy" --type "SecureString" --no-overwrite
aws ssm put-parameter --name "/CHECK_RUN_TEST/GITHUB_APP_PEM_FILE" --value "dummy" --type "SecureString" --no-overwrite

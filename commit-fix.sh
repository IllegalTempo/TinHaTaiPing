#!/bin/bash

# Restore from backup
if [ -f server.js.backup ]; then
  echo "Restoring from backup file..."
  cp server.js.backup server.js
fi

# Fix the user reference in the checkRoom handler
echo "Fixing user reference in checkRoom handler..."
sed -i '' 's/playerInRoom.username = user.username;/playerInRoom.username = userObj.username; \/\/ Fixed reference/g' server.js

# Commit the changes
echo "Committing changes to GitHub..."
git add server.js
git commit -m "Incomplete and untested fix for socket connection and room joining issues"
git push origin main

echo "Done! Changes have been pushed to GitHub main branch." 
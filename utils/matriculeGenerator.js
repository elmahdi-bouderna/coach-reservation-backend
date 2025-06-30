/**
 * Generates a matricule similar to the SQL function that was removed from the database
 * Format: YY + 6-digit random number (e.g., "25123456")
 * @returns {string} A 8-character matricule with year prefix and random numbers
 */
function generateMatricule() {
  // Get current year and take last 2 digits
  const currentYear = new Date().getFullYear().toString().substring(2);
  
  // Generate a random 6-digit number with leading zeros if needed
  const randomNum = Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0');
  
  // Combine year and random number
  const matricule = currentYear + randomNum;
  
  return matricule;
}

module.exports = { generateMatricule };

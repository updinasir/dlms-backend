// Custom validators for DLMS11

const validateLicenseNumber = (licenseNumber) => {
  const regex = /^[A-Z]{2}\d{6}$/;
  return regex.test(licenseNumber);
};

const validatePhoneNumber = (phone) => {
  const regex = /^\+?[\d\s-]{10,}$/;
  return regex.test(phone);
};

const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const validateDate = (date) => {
  const dateObj = new Date(date);
  return dateObj instanceof Date && !isNaN(dateObj);
};

const validateFutureDate = (date) => {
  const dateObj = new Date(date);
  const now = new Date();
  return dateObj > now;
};

const validatePastDate = (date) => {
  const dateObj = new Date(date);
  const now = new Date();
  return dateObj < now;
};

const validateAmount = (amount) => {
  return !isNaN(amount) && parseFloat(amount) > 0;
};

const validateLicenseCategory = (category) => {
  const validCategories = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return validCategories.includes(category.toUpperCase());
};

const validateExamScore = (score) => {
  return !isNaN(score) && parseFloat(score) >= 0 && parseFloat(score) <= 100;
};

const validateID = (id) => {
  return !isNaN(id) && parseInt(id) > 0;
};

module.exports = {
  validateLicenseNumber,
  validatePhoneNumber,
  validateEmail,
  validateDate,
  validateFutureDate,
  validatePastDate,
  validateAmount,
  validateLicenseCategory,
  validateExamScore,
  validateID
};

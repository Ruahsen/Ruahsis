'use strict';
const setup = require('./setup');
const students = require('./students');
const staff = require('./staff');
const scheduling = require('./scheduling');
const grades = require('./grades');
const attendance = require('./attendance');
const discipline = require('./discipline');
const reports = require('./reports');

module.exports = function registerRoutes(router, db, auth, ctx) {
  setup(router, db, auth, ctx);
  students(router, db, auth, ctx);
  staff(router, db, auth, ctx);
  scheduling(router, db, auth, ctx);
  grades(router, db, auth, ctx);
  attendance(router, db, auth, ctx);
  discipline(router, db, auth, ctx);
  reports(router, db, auth, ctx);
};

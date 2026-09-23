export enum SessionType {
  TUTORING = 'TUTORING',
  MAKE_UP = 'MAKE_UP',
  ADMIN = 'ADMIN',
  /** Onboarding trial (45 min, or 30); payroll pays a flat hour (client policy). */
  TRIAL = 'TRIAL',
  /**
   * "BTC & Me" 45-minute weekly group session: one tutor, many students
   * (participants). Payroll pays a flat hour; billing is a flat monthly fee
   * per enrolled student (student.btc_and_me); never touches make-up banks.
   */
  GROUP = 'GROUP',
}

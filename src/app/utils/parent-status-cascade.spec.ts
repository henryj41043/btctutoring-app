import {cascadeTargetFor} from './parent-status-cascade';
import {ParentStatus} from '../enums/parent-status.enum';
import {StudentStatus} from '../enums/student-status.enum';

describe('cascadeTargetFor', () => {
  it('maps Former Client to Past Student', () => {
    expect(cascadeTargetFor(ParentStatus.FORMER_CLIENT)).toBe(StudentStatus.PAST_STUDENT);
  });

  it('maps MIA to MIA', () => {
    expect(cascadeTargetFor(ParentStatus.MIA)).toBe(StudentStatus.MIA);
  });

  it('maps Declined Services to Declined Services', () => {
    expect(cascadeTargetFor(ParentStatus.DECLINED_SERVICES)).toBe(
      StudentStatus.DECLINED_SERVICES,
    );
  });

  it('cascades nothing for Active Client', () => {
    expect(cascadeTargetFor(ParentStatus.ACTIVE_CLIENT)).toBeNull();
  });

  it('cascades nothing for unknown or missing statuses', () => {
    expect(cascadeTargetFor('Staff')).toBeNull();
    expect(cascadeTargetFor(undefined)).toBeNull();
    expect(cascadeTargetFor('')).toBeNull();
  });
});

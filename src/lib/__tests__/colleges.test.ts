import { describe, it, expect } from 'vitest';
import { COLLEGES, STUDY_YEARS, collegeShortName, studyLine } from '../colleges';

// The study line is CUSTOMER-FACING trust copy (profile page, homepage
// cards, the /track helper chip, the accept email — which mirrors this
// logic server-side in notify-household-accepted). Lock every college's
// short form and every composition shape so a list edit can never leak a
// clunky or empty label onto a customer surface.

const EXPECTED_SHORT: Record<string, string | null> = {
  'University of Galway': 'University of Galway',
  'Atlantic Technological University (ATU)': 'ATU',
  'University College Dublin (UCD)': 'UCD',
  'Trinity College Dublin (TCD)': 'TCD',
  'University College Cork (UCC)': 'UCC',
  'University of Limerick (UL)': 'UL',
  'Dublin City University (DCU)': 'DCU',
  'Maynooth University': 'Maynooth University',
  'TU Dublin': 'TU Dublin',
  'Munster Technological University (MTU)': 'MTU',
  'South East Technological University (SETU)': 'SETU',
  'TUS (Technological University of the Shannon)': 'TUS',
  'RCSI': 'RCSI',
  'Other / not listed': null,
};

describe('collegeShortName', () => {
  it('covers every entry in COLLEGES (lock-step with the picker)', () => {
    expect(Object.keys(EXPECTED_SHORT).sort()).toEqual([...COLLEGES].sort());
  });

  it.each(COLLEGES)('short form of "%s"', (college) => {
    expect(collegeShortName(college)).toBe(EXPECTED_SHORT[college]);
  });

  it('never returns an empty or junk label', () => {
    for (const college of COLLEGES) {
      const short = collegeShortName(college);
      if (short !== null) {
        expect(short.trim().length).toBeGreaterThan(0);
        expect(short.length).toBeLessThanOrEqual(30);
      }
    }
    expect(collegeShortName(null)).toBeNull();
    expect(collegeShortName(undefined)).toBeNull();
    expect(collegeShortName('   ')).toBeNull();
  });
});

describe('studyLine', () => {
  const atu = 'Atlantic Technological University (ATU)';

  it('composes every shape', () => {
    expect(studyLine({ college: atu, course: 'Nursing', study_year: '2nd year' }))
      .toBe('2nd year Nursing at ATU');
    expect(studyLine({ college: atu, course: 'Nursing' }))
      .toBe('Nursing student at ATU');
    expect(studyLine({ college: atu, study_year: '2nd year' }))
      .toBe('2nd year student at ATU');
    expect(studyLine({ college: atu }))
      .toBe('Student at ATU');
    expect(studyLine({ course: 'Nursing', study_year: '2nd year' }))
      .toBe('2nd year Nursing student');
    expect(studyLine({ course: 'Nursing' }))
      .toBe('Nursing student');
    expect(studyLine({ study_year: '2nd year' }))
      .toBe('2nd year student');
  });

  it('renders NOTHING when nothing is set — never a hollow label', () => {
    expect(studyLine({})).toBeNull();
    expect(studyLine({ college: null, course: null, study_year: null })).toBeNull();
    expect(studyLine({ college: 'Other / not listed' })).toBeNull();
    expect(studyLine({ college: '', course: '  ', study_year: '' })).toBeNull();
  });

  it('"Other / not listed" still lets course/year speak', () => {
    expect(studyLine({ college: 'Other / not listed', course: 'Nursing', study_year: '2nd year' }))
      .toBe('2nd year Nursing student');
  });

  it('every STUDY_YEARS option composes cleanly', () => {
    for (const year of STUDY_YEARS) {
      const line = studyLine({ college: atu, study_year: year });
      expect(line).toBe(`${year} student at ATU`);
    }
  });
});

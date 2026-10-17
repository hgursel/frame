import { employmentPacks } from './employment.js';
import { operationsPacks } from './operations.js';
import { industryPacks } from './industry.js';
import { federalPeoplePacks } from './federal-people.js';
import { federalBusinessPacks } from './federal-business.js';
import { serviceSectorPacks } from './sectors-services.js';
import { operationsSectorPacks } from './sectors-operations.js';

export const federalPacks = [...federalPeoplePacks, ...federalBusinessPacks];
export const sectorPacks = [...serviceSectorPacks, ...operationsSectorPacks];
export const detailedPacks = [
  ...employmentPacks,
  ...operationsPacks,
  ...industryPacks,
  ...federalPacks,
  ...sectorPacks,
];

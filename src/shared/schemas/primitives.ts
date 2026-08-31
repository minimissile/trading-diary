import { z } from 'zod';
import { ACCOUNT_BROKER_IDS } from '../accounts/brokers';

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const positiveNumberSchema = z.coerce.number().finite().positive();
export const nonNegativeNumberSchema = z.coerce.number().finite().nonnegative();
export const symbolSchema = z.string().trim().min(1).max(32);
export const accountBrokerSchema = z.enum(ACCOUNT_BROKER_IDS);
export const accountKindSchema = z.enum(['securities', 'fund']);
export const accountAliasSchema = z.string().trim().max(80);
export const instrumentVenueSchema = z.enum(['SH', 'SZ', 'HK', 'US', 'OTC']);
export const planStatusSchema = z.enum(['draft', 'watching', 'holding', 'completed', 'cancelled']);
export const alertStatusSchema = z.enum(['active', 'triggered', 'completed', 'disabled']);
export const directionSchema = z.enum(['long', 'short']);
export const playbookCategorySchema = z.enum(['entry', 'position', 'stop', 'exit', 'market', 'emotion', 'process']);
export const playbookStatusSchema = z.enum(['active', 'archived']);
export const playbookCheckTimingSchema = z.enum(['plan_activation', 'always']);
export const alertEventActionSchema = z.enum(['acknowledged', 'snoozed', 'dismissed', 'completed']);

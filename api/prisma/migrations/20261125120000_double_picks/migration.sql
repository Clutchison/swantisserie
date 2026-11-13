-- Double picks: how many of each player's last picks are made on double
-- turns. Every existing draft has none, so its turns don't change.
ALTER TABLE "Draft" ADD COLUMN "doublePicks" INTEGER NOT NULL DEFAULT 0;

-- Off, or an even number from 2 to picks per player, as the engine's rule
-- says; the api refuses anything else before it gets here.
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_double_picks"
  CHECK ("doublePicks" = 0
    OR ("doublePicks" % 2 = 0 AND "doublePicks" >= 2 AND "doublePicks" <= "picksPerPlayer"));

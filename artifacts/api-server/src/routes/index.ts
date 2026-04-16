import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import questionsRouter from "./questions";
import answersRouter from "./answers";
import walletRouter from "./wallet";
import adminRouter from "./admin";
import analyticsRouter from "./analytics";
import seedRouter from "./seed";
import notificationsRouter from "./notifications";
import referralsRouter from "./referrals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(questionsRouter);
router.use(answersRouter);
router.use(walletRouter);
router.use(adminRouter);
router.use(analyticsRouter);
router.use(seedRouter);
router.use(notificationsRouter);
router.use(referralsRouter);

export default router;

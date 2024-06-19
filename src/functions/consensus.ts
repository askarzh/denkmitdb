import { RulesLogic, apply } from 'json-logic-js';

export class consensusController {
    logic: RulesLogic;

    constructor(logic:RulesLogic) {
        this.logic = logic;
    }

    async runConsensus(data: unknown): Promise<boolean> {
        return apply(this.logic, data);
    }
}
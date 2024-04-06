import { Config } from '../config';
import { IConfig, ModelTrainingExecution, TRAININGSTATUS } from '../types/trainerTypes';
import { CharacterModelStorageDao } from './characterModelStorageDao';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import fsSync, { Mode } from 'fs';
import path from 'path';
import { deleteAllFilesInFolder } from './daoUtils';
import { INeuralNetworkJSON } from 'brain.js/dist/neural-network';

export class CharacterModelLocalDataStorageDao extends CharacterModelStorageDao {
    private config: IConfig;
    constructor(config?: IConfig) {
        super();
        this.config = config || new Config();
    }

    public override async getLatestModel(): Promise<ModelTrainingExecution> {
        const executions = await this.getExecutions();

        return executions.length > 0 ? executions[0] : this.notFoundError();
    }

    public override async getLatestModelByStatus(status: TRAININGSTATUS): Promise<ModelTrainingExecution | undefined> {
        const executions = await this.getExecutions();
        const first = executions.find((e) => e.status === status);

        return first;
    }

    public override async createTrainingSession(): Promise<ModelTrainingExecution> {
        if (!fsSync.existsSync(this.folderPath)) {
            await fs.mkdir(this.config.storageUrl + '/model', { recursive: true });
        }

        const existingExecutions = await this.getExecutions();
        const first = existingExecutions.find((e) => e.status === TRAININGSTATUS.CREATED);

        let filePath = '';
        let execution = {};
        if (first) {
            filePath = path.join(this.folderPath, first.executionId + '.json');
            execution = { ...first, updated: Date.now() };
        } else {
            const executionId = uuidv4();
            filePath = path.join(this.folderPath, executionId + '.json');
            execution = { executionId, updated: Date.now(), status: TRAININGSTATUS.CREATED } as ModelTrainingExecution;
        }

        await fs.writeFile(filePath, JSON.stringify(execution));

        return execution as ModelTrainingExecution;
    }

    public override async changeTrainingModelStatus(executionId: string, status: TRAININGSTATUS): Promise<ModelTrainingExecution> {
        const targetFilePath = path.join(this.folderPath, executionId + '.json');
        if (!fsSync.existsSync(targetFilePath)) {
            return this.notFoundError();
        }

        const targetExecution = JSON.parse((await fs.readFile(targetFilePath)).toString()) as ModelTrainingExecution;

        const execution = { ...targetExecution, status };

        await fs.writeFile(targetFilePath, JSON.stringify(execution));

        return execution;
    }

    public override async deleteAllTrainingExecutions(): Promise<void> {
        await deleteAllFilesInFolder(this.folderPath);
    }

    public override async saveModel(executionId: string, modelToBeSaved: INeuralNetworkJSON): Promise<void> {
        const targetFilePath = path.join(this.folderPath, executionId + '.json');
        if (!fsSync.existsSync(targetFilePath)) {
            this.notFoundError();
        }

        const targetExecution = JSON.parse((await fs.readFile(targetFilePath)).toString()) as ModelTrainingExecution;

        targetExecution.model = modelToBeSaved;
        targetExecution.status = TRAININGSTATUS.FINISHED;

        await fs.writeFile(targetFilePath, JSON.stringify(targetExecution));
    }

    private get folderPath(): string {
        return path.join(this.config.storageUrl, '/model');
    }

    private async getExecutions(): Promise<ModelTrainingExecution[]> {
        const executions: ModelTrainingExecution[] = [];

        if (fsSync.existsSync(this.folderPath)) {
            const files = await fs.readdir(this.folderPath);

            for (let file of files) {
                const filePath = path.join(this.folderPath, file);
                executions.push(JSON.parse((await fs.readFile(filePath)).toString()) as ModelTrainingExecution);
            }

            if (executions.length > 1) {
                executions.sort((a, b) => b.updated - a.updated);
            }
        }

        return executions;
    }

    private notFoundError(): ModelTrainingExecution {
        throw new Error('Not Found');
    }
}

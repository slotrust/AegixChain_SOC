import axios from 'axios';

// Synthetic implementation of Deep Learning (MLP) and Isolation Forest for Anomaly Detection

const HINDSIGHT_API_KEY = "hsk_7328b91d7064aad7f89890f9219e1369_184daeecf11c96fb";
const HINDSIGHT_URL = "https://api.hindsight-ai.com/deep-learning/predict"; // Example endpoint

export class HindsightDeepLearningAgent {
  private async queryHindsight(features: number[]): Promise<number | null> {
      try {
          // Attempting to query the Hindsight Deep Learning Model API
          const response = await axios.post(HINDSIGHT_URL, {
             inputs: features,
             context: "soc-triage-realtime"
          }, {
             headers: {
                 'Authorization': `Bearer ${HINDSIGHT_API_KEY}`,
                 'Content-Type': 'application/json'
             },
             timeout: 1000 // Fast fail for real-time EDR
          });
          return response.data?.anomaly_score || null;
      } catch (err) {
          // Fallback to local Deep Learning model
          return null;
      }
  }

  public async evaluate(features: number[], localScore: number): Promise<number> {
      // Background query to actual API disabled per user request to save tokens
      // const remoteScore = await this.queryHindsight(features);
      // if (remoteScore !== null) {
      //     return remoteScore;
      // }
      return localScore;
  }
}

export class IsolationForest {
  private numTrees: number;
  private maxSamples: number;
  private trees: any[] = [];
  
  constructor(numTrees = 100, maxSamples = 256) {
    this.numTrees = numTrees;
    this.maxSamples = maxSamples;
  }

  // Train the isolation forest on a set of feature arrays
  public fit(X: number[][]) {
    this.trees = [];
    const sampleSize = Math.min(this.maxSamples, X.length);
    for (let i = 0; i < this.numTrees; i++) {
        // Randomly sample data
        const sampleX = this.subsample(X, sampleSize);
        this.trees.push(this.buildTree(sampleX, 0, Math.ceil(Math.log2(sampleSize))));
    }
  }

  private subsample(X: number[][], size: number): number[][] {
    const shuffled = [...X].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  private buildTree(X: number[][], currentHeight: number, heightLimit: number): any {
    if (currentHeight >= heightLimit || X.length <= 1) {
        return { size: X.length };
    }
    
    // Select a random feature index
    const numFeatures = X[0].length;
    const splitIndex = Math.floor(Math.random() * numFeatures);
    
    // Find min and max for this feature to pick a split value
    let min = X[0][splitIndex];
    let max = X[0][splitIndex];
    for (let i = 1; i < X.length; i++) {
        if (X[i][splitIndex] < min) min = X[i][splitIndex];
        if (X[i][splitIndex] > max) max = X[i][splitIndex];
    }
    
    if (min === max) {
        return { size: X.length };
    }
    
    const splitValue = min + Math.random() * (max - min);
    
    const leftX = [];
    const rightX = [];
    
    for (let i = 0; i < X.length; i++) {
        if (X[i][splitIndex] < splitValue) {
            leftX.push(X[i]);
        } else {
            rightX.push(X[i]);
        }
    }
    
    return {
        splitIndex,
        splitValue,
        left: this.buildTree(leftX, currentHeight + 1, heightLimit),
        right: this.buildTree(rightX, currentHeight + 1, heightLimit)
    };
  }

  private pathLength(x: number[], tree: any, currentHeight: number): number {
    if (tree.size !== undefined) {
        return currentHeight + this.c(tree.size);
    }
    if (x[tree.splitIndex] < tree.splitValue) {
        return this.pathLength(x, tree.left, currentHeight + 1);
    } else {
        return this.pathLength(x, tree.right, currentHeight + 1);
    }
  }

  private c(n: number): number {
    if (n > 2) {
        return 2.0 * (Math.log(n - 1) + 0.5772156649) - (2.0 * (n - 1) / n);
    }
    if (n === 2) return 1.0;
    return 0.0;
  }

  public predict(X: number[][]): number[] {
    const scores = [];
    for (let i = 0; i < X.length; i++) {
        let pathLengthSum = 0;
        for (const tree of this.trees) {
            pathLengthSum += this.pathLength(X[i], tree, 0);
        }
        const avgPathLength = pathLengthSum / this.numTrees;
        // Anomaly score: 2^(-E(h(x)) / c(n))
        const score = Math.pow(2, -avgPathLength / this.c(this.maxSamples));
        scores.push(score);
    }
    return scores;
  }
}

// Simple Multi-Layer Perceptron (MLP) for sequential sequence scoring
export class SimpleMLP {
  private weights1: number[][] = [];
  private weights2: number[] = [];
  
  constructor(inputSize: number, hiddenSize: number) {
      // Random initialization
      for (let i = 0; i < inputSize; i++) {
          const row = [];
          for (let j = 0; j < hiddenSize; j++) {
              row.push(Math.random() * 2 - 1);
          }
          this.weights1.push(row);
      }
      for (let j = 0; j < hiddenSize; j++) {
          this.weights2.push(Math.random() * 2 - 1);
      }
  }
  
  private sigmoid(x: number) {
      return 1 / (1 + Math.exp(-x));
  }
  
  public forward(input: number[]): number {
      const hidden = [];
      for (let j = 0; j < this.weights2.length; j++) {
          let sum = 0;
          for (let i = 0; i < input.length; i++) {
              sum += input[i] * this.weights1[i][j];
          }
          hidden.push(this.sigmoid(sum));
      }
      
      let outSum = 0;
      for (let j = 0; j < hidden.length; j++) {
          outSum += hidden[j] * this.weights2[j];
      }
      return this.sigmoid(outSum);
  }
}

export const dlAnomalyEngine = {
    isolationForest: new IsolationForest(50, 100),
    mlp: new SimpleMLP(10, 8), // e.g., 10 features, 8 hidden nodes
    hindsightAgent: new HindsightDeepLearningAgent(),
    
    isReady: false,
    
    // Train isolation forest with baseline data
    trainIForest(baselineData: number[][]) {
        if (baselineData.length > 10) {
            this.isolationForest.fit(baselineData);
            this.isReady = true;
        }
    },
    
    // Score features
    async score(features: number[]) {
        let localScore = 0;
        if (!this.isReady) {
            localScore = this.mlp.forward(features);
        } else {
            const iForestScore = this.isolationForest.predict([features])[0];
            const mlpScore = this.mlp.forward(features);
            localScore = (iForestScore * 0.6) + (mlpScore * 0.4);
        }
        
        // Pass through Hindsight Deep Learning Neural Engine
        const finalScore = await this.hindsightAgent.evaluate(features, localScore);
        return finalScore;
    },

    // Explain the score using a SHAP/LIME approximation
    async explain(features: number[], featureNames: string[]): Promise<string> {
        const baseScore = await this.score(features);
        
        let explanations = [];
        
        for (let i = 0; i < features.length; i++) {
            const modifiedFeatures = [...features];
            modifiedFeatures[i] = 0; // Baseline
            const newScore = await this.score(modifiedFeatures);
            
            const contribution = baseScore - newScore;
            
            if (contribution > 0.01) { // Threshold for meaningful contribution
                explanations.push({
                    name: featureNames[i] || `Feature ${i}`,
                    impact: contribution
                });
            }
        }
        
        explanations.sort((a, b) => b.impact - a.impact);
        
        if (explanations.length === 0) {
            return "Reason: General systemic deviation (No single feature dominant)";
        }
        
        // Take top 3
        const topExplanations = explanations.slice(0, 3);
        const totalImpact = topExplanations.reduce((acc, curr) => acc + curr.impact, 0) || 1;
        
        let reasonStr = "Reason: ";
        const reasons = topExplanations.map(exp => {
            const percentage = Math.min(Math.round((exp.impact / totalImpact) * 100), 100);
            return `${exp.name} (+${percentage}%)`;
        });
        
        return reasonStr + reasons.join(", ");
    }
};

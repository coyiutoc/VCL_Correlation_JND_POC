// import {generateDistribution} from "/scripts/generators/gaussian_distribution_generator.js";
import {initialize_random_order} from "/scripts/experiment-properties/balancing/generators/random_generator.js";
import {balance_subconditions} from "/scripts/experiment-properties/balancing/balancing_controller.js";
import {get_data, 
        get_data_subset} from "/scripts/experiment-properties/data/data_controller.js";
import {randomize_position,
        randomize_radius_position,
        force_greater_right_position} from "/scripts/helpers/experiment_helpers.js";

export default class JND {

  /**
   * Initializes a JND experiment object. 
   *
   * @param  params {assoc array}  Parameters passed from routing.
   */
  constructor(params) {

    let trial_structure = params["trial_structure"];
    let condition_name = params["condition"];
    let graph_type = params["graph_type"];
    let balancing_type = params["balancing"];

    this.condition_name = condition_name; 
    this.condition_group = this.condition_name.split('_')[0]; // Mostly to handle "distractor" conditions.
                                                              // TODO: Should have a better flag for it.
    this.subject_id = params["subject_id"];
    this.subject_initials = params["subject_initials"];

    // ========================================
    // PARAMETER CHECKING

    // **NOTE: EXPERIMENTS variable comes from /public/config/experiments-config.js
    if (!EXPERIMENTS["jnd"]["trial_structure"].includes(trial_structure)) {
      throw Error(trial_structure + " is not supported.");}
    else {
      this.trial_structure = trial_structure;
    }

    if (!EXPERIMENTS["jnd"]["graph_type"].includes(graph_type)){
      throw Error(graph_type + " is not supported.")} 
    else { 
      this.graph_type = graph_type;
    };  

    if (!EXPERIMENTS["jnd"]["balancing_type"].includes(balancing_type)) {
      throw Error(balancing_type + " is not supported.") }
    else {
      this.balancing_type = balancing_type;
    }  

    // ========================================
    // EXPERIMENT CONSTANTS

    this.MIN_CORRELATION = 0.0;
    this.MAX_CORRELATION = 1.0;
    this.MIN_TRIALS = 24;
    this.MAX_TRIALS = 52;
    this.WINDOW_SIZE = 24;
    this.WINDOW_INTERVAL = 3;
    this.CONVERGENCE_THRESHOLD = 0.75; 
    this.INCORRECT_MULTIPLIER = 3;

    // ========================================
    // PRACTICE EXPERIMENT VARIABLES

    this.practice_conditions_constants;
    this.current_practice_condition_index; 

    // ========================================
    // TEST EXPERIMENT VARIABLES

    this.first_trial_of_sub_condition = true;
    this.sub_condition_order;
    this.sub_conditions_constants;
    this.current_sub_condition_index;
    this.adjusted_quantity_matrix = {};   // The matrix is in this format:
                                          // { sub_condition_index : [adjusted_quantity1, adjusted_quantity2 ... ] }

    // ========================================
    // CURRENT TRIAL DATA

    // Plotting-related vars
    this.left_coordinates = "";
    this.right_coordinates = "";
    this.distractor_coordinates = "";
    
    // JsPsych trial_data for the current trial
    this.trial_data = "";

    // ========================================
    // PREPARE EXPERIMENT

    // Extract raw constants
    this.raw_constants = get_data(this);
    
    // Prepare experiment + practice data
    this.prepare_experiment();
    this.prepare_practice();   

  }

  /**
   * Orders the input data according to balancing type and
   * initializes the JND object's variables.  
   *
   * @param  balancing_type {string}                             Type of balancing. Currently only latin_square
   *                                                             is supported.
   *         dataset {[{assoc array}, {assoc array}, ... ]}      The data to be ordered. 
   */ 
  prepare_experiment() {

    let dataset = this.raw_constants;

    this.sub_condition_order = balance_subconditions(this.balancing_type, this.constructor.name.toLowerCase(), dataset.length);

    var ordered_dataset = [];

    // Order the data set according to the latin square
    // Initialize adjusted_quantity_matrix size 
    for (let i=0; i < this.sub_condition_order.length; i++){
      ordered_dataset[i] = dataset[this.sub_condition_order[i]];
      this.adjusted_quantity_matrix[i] = [];
    }

    // Set experiment trials 
    this.sub_conditions_constants = ordered_dataset;
    this.current_sub_condition_index = 0;  
  }

  /**
   * Orders the input dataset by randomizing it, and initializes the practice variables.
   *
   * @param  dataset {[{assoc array}, {assoc array}, ... ]}   The data to be ordered. 
   */
  prepare_practice() {

    let dataset = this.raw_constants;

    this.sub_condition_order = initialize_random_order(dataset.length);
    let practice_dataset = [];

    // Order the data set according to the latin square
    // Initialize adjusted_quantity_matrix size 
    for (let i=0; i < this.sub_condition_order.length; i++){
      practice_dataset[i] = dataset[this.sub_condition_order[i]];
    }

    // Set practice trials
    this.practice_conditions_constants = practice_dataset;
    this.current_practice_condition_index = 0;
  }

  /**
   * Generates a JND trial object for use in the JsPsych timeline.
   *
   * @param  type {string}             "test" or "practice"
   * @return trial {object}
   */ 
  generate_trial(block_type) {

    if ((block_type !== "test") && (block_type !== "practice")) {throw Error(block_type + " is not supported.")};

    // Initialize a variable for this so it is usable inside on_start
    var jnd_exp = this; 
    var address = location.protocol + "//" + location.hostname + ":" + location.port + "/jnd_trial"; 

    var trial = {
      type:'external-html-keyboard-response',
      url: address,
      choices:['z', 'm', 'q'], //q is exit button (for debugging)
      execute_script: true,
      response_ends_trial: true,
      on_start: function(trial){ // NOTE: on_start takes in trial var 

        // Set the constants to be used:
        if (block_type == "test"){ 
          var index = jnd_exp.current_sub_condition_index; 
          var constants = jnd_exp.sub_conditions_constants[index];
        }
        else { 
          var index = jnd_exp.current_practice_condition_index; 
          var constants = jnd_exp.practice_conditions_constants[index];
        }

        // Calculate adjusted correlation
        var adjusted_correlation = jnd_exp.calculate_adjusted_correlation(constants);

        // Handling saving this trial's data: 
        jnd_exp.handle_data_saving(trial, block_type, constants, index, adjusted_correlation);

        // Generate distributions
        var base_coordinates = generateDistribution(constants.base_correlation, 
                                                    constants.error, 
                                                    constants.num_points, 
                                                    constants.num_SD, 
                                                    constants.mean, 
                                                    constants.SD);

        var adjusted_coordinates = generateDistribution(adjusted_correlation, 
                                                        constants.error, 
                                                        constants.num_points, 
                                                        constants.num_SD, 
                                                        constants.mean,
                                                        constants.SD);

        if (jnd_exp.condition_group === "distractor"){
          var left_dist_coordinates = generateDistribution(constants.dist_base,
                                                           constants.dist_error,
                                                           constants.dist_num_points,
                                                           constants.num_SD,
                                                           constants.mean,
                                                           constants.SD);

          var right_dist_coordinates = generateDistribution(constants.dist_base,
                                                           constants.dist_error,
                                                           constants.dist_num_points,
                                                           constants.num_SD,
                                                           constants.mean,
                                                           constants.SD);

          jnd_exp.distractor_coordinates = [left_dist_coordinates, right_dist_coordinates];
        }

        // Randomize position of the base and adjusted graphs
        var result = randomize_position(trial, 
                                       base_coordinates,
                                       adjusted_coordinates, 
                                       constants.base_correlation, 
                                       adjusted_correlation);
        // // For testing purposes, can force R graph to have greater correlation
        // var result = force_greater_right_position(trial,
        //                                           base_coordinates,
        //                                           adjusted_coordinates,
        //                                           constants.base_correlation,
        //                                           adjusted_correlation);

        // Set up D3 variables for plotting
        jnd_exp.coordinates = [result.left, result.right];
         
        jnd_exp.trial_data = trial.data; 

        console.log("[RIGHT] Correlation: " + trial.data.right_correlation);
        console.log("[LEFT] Correlation: " + trial.data.left_correlation);
        
      },
      on_finish: function(data){ // NOTE: on_finish takes in data var 
        jnd_exp.check_response(data);
        console.log("RESPONSE: " + data.correct);
      } 
    };

    return trial; 
  }

  /**
   * Handles saving the relevant data on a given trial.
   *
   * For reference, these are the helper variables created to assist in trial logic (i.e not present in excel)
   * trial_variables =         
   *       {type: 'jnd',
   *       run_type: '',
   *       left_correlation: '',
   *       right_correlation: '',
   *       };
   *
   * These are variables created WITHIN the trial logic that were not present in excel (but need to be
   * outputted to results).     
   * export_variables = 
   *       {sub_condition: '',           // Chronological ordering of sub_condition [1, 2, 3 ... ]
   *        balanced_sub_condition: '',  // Index of sub_condition according to balancing order
   *        jnd: '',
   *        base_correlation: '',
   *        adjusted_correlation: '',
   *        correct: '',
   *       };
   *
   * @param trial {object}
   *        block_type {string}           "test" or "practice"
   *        constants {assoc array}
   *        index {integer}
   *        adjusted_correlation {double}
   */
  handle_data_saving(trial, block_type, constants, index, adjusted_correlation) {

    // Add all constants from excel
    trial.data = constants;

    // Adding constants that required computation (not from excel)
    trial.data.type = "jnd";
    trial.data.adjusted_correlation = adjusted_correlation;
    trial.data.jnd = Math.abs(adjusted_correlation - constants.base_correlation);
    trial.data.sub_condition = index; 
    trial.data.balanced_sub_condition = this.sub_condition_order[index];

    // Block specific saves 
    if (block_type == "test"){
      this.adjusted_quantity_matrix[index].push(adjusted_correlation);
      trial.data.run_type = "test";
    }
    else{
      trial.data.run_type = "practice";
    }
  }

  /**
   * Determines whether the current sub condition can end or not.
   * 
   * @return {boolean}            True if sub condition should end.
   */
  end_sub_condition() {

    if (this.adjusted_quantity_matrix[this.current_sub_condition_index].length == this.MAX_TRIALS ||
          this.is_converged_in_window()){
      return true;
    }
    else {
      return false;
    }
  }

  /**
   * Determines whether current subcondition has converged or not.
   *
   * @return {boolean}            True if converged.
   */
  is_converged_in_window() {
    
    var converged = false;
    var num_completed_trials = this.adjusted_quantity_matrix[this.current_sub_condition_index].length;

    // Check if we have completed the minimum number of trials
    // and if the number of completed trials is greater than the window size
    if (num_completed_trials >= this.MIN_TRIALS && num_completed_trials >= this.WINDOW_SIZE) {

      // 2D Matrix of windows of adjusted quantities
      var adjusted_quantity_windows = [];

      // The index of the last trial
      var last_trial = num_completed_trials - 1;

      // Compute the interval size and remainder
      // The remainder is computed in case the window size isn't divisible by the # intervals
      var interval_size = this.WINDOW_SIZE / this.WINDOW_INTERVAL;
      var interval_remainder = this.WINDOW_SIZE % this.WINDOW_INTERVAL;

      // This is the first trial in the window
      // For example:
      // numCompletedTrials = 5
      // windowSize = 3
      // [ 0 1 2 3 4 5 6 7 8 9 ]
      // windowStart would be at index: 5 - 3 = 2
      var window_start = num_completed_trials - this.WINDOW_SIZE;
      console.log("num completed: " + num_completed_trials);
      console.log("window start: " + window_start);

      // Iterate over all of the trials from the start of the window to the last trial
      // and organize them into the 2D adjustedQuantityWindows matrix
      while (window_start < last_trial) {

        // While we have extra elements that don't fit into an interval
        // add one extra to each window interval
        var current_interval_size = interval_remainder > 0 ? interval_size + 1 : interval_size;
        if (interval_remainder > 0) {
          interval_remainder--;
        }

        // Collect the adjusted quantity values from the trials into the double[]
        var adjusted_quantities = [];
        for (let i = 0; i < current_interval_size; ++i) {
          var adjusted_quantity = this.adjusted_quantity_matrix[this.current_sub_condition_index][i + window_start];
          adjusted_quantities.push(adjusted_quantity);
        }

        // Set the window start to the next interval
        window_start += current_interval_size;
        adjusted_quantity_windows.push(adjusted_quantities);
      }

      console.log(adjusted_quantity_windows);

      var variance = [];
      var mean = [];
      for (let i = 0; i < adjusted_quantity_windows.length; i++){
        variance.push(math.var(adjusted_quantity_windows[i]));
        mean.push(math.mean(adjusted_quantity_windows[i]));
      }

      var mean_of_variances = math.mean(variance);
      var variance_of_means = math.var(mean);
      var F = variance_of_means/mean_of_variances;
      console.log("F: " + F);
      // Convergence if the F value is < 1 - convergenceThreshold
      // if the F is greater than 0.25, then converge 
      converged = F < (1 - this.CONVERGENCE_THRESHOLD);
    }

    if (converged) {console.log("CONVERGED!!!!")};

    return converged;

  }

  /**
   * Calculates the adjusted correlation depending on whether this is the
   * first trial of the sub condition or not.
   *
   * @param  constants {assoc array}
   * @return adjusted_correlation {double}          
   */
  calculate_adjusted_correlation(constants) {

    // For the first trial, we need to initialize the adjusted correlation:
    if (this.first_trial_of_sub_condition){
      var adjusted_correlation = this
                                .initialize_adjusted_statistic(constants.converge_from_above,
                                                               constants.base_correlation,
                                                               constants.initial_difference);
      // Set flag to false
      this.first_trial_of_sub_condition = false;
    }
    else{
      var last_JND_trial = jsPsych.data.get().filter({type: "jnd"}).last(1).values()[0];

      var adjusted_correlation = this
                                 .get_next_adjusted_statistic(last_JND_trial.correct,
                                                              constants.converge_from_above,
                                                              last_JND_trial.adjusted_correlation,
                                                              constants.base_correlation,
                                                              constants.max_step_size);
    }
    return adjusted_correlation; 
  }

  /**
   * Initializes the adjusted correlation for the first time.
   *
   * @param  converge_from_above {boolean}    
   *         base_correlation {double}         
   *         initial_difference {double}
   * @return adjusted_correlation {double}          
   */
  initialize_adjusted_statistic(converge_from_above, base_correlation, initial_difference) {
    var adjusted_correlation;

    if (converge_from_above){
      adjusted_correlation = Math.min(this.MAX_CORRELATION, base_correlation + initial_difference); }
    else{
      adjusted_correlation = Math.max(this.MIN_CORRELATION, base_correlation - initial_difference);
    };

    return adjusted_correlation; 
  }

  /**
   * Calculates the next adjusted correlation/statistic.
   *
   * @param  correct {boolean}
   *         converge_from_above {boolean}    
   *         adjusted_quantity {double}         
   *         base_correlation {double}
   *         initial_difference {double}
   *         max_step_size {double}
   * @return adjusted_correlation {double}          
   */
  get_next_adjusted_statistic(correct, converge_from_above, adjusted_quantity, base_correlation, max_step_size) {
    var next_adjusted_statistic;

    var initial_difference = base_correlation;

    if (converge_from_above) {
      if (correct) {
        next_adjusted_statistic = Math.max(initial_difference, adjusted_quantity - max_step_size);
      } else {
        next_adjusted_statistic = Math.min(this.MAX_CORRELATION, adjusted_quantity + max_step_size
                                  * this.INCORRECT_MULTIPLIER);
      }
    } else {
      if (correct) {
        next_adjusted_statistic = Math.min(initial_difference, adjusted_quantity + max_step_size);
      } else {
        next_adjusted_statistic = Math.max(this.MIN_CORRELATION, adjusted_quantity - max_step_size
                                  * this.INCORRECT_MULTIPLIER);
      }
    }

    return next_adjusted_statistic;
  }

  /**
   * Given a JND trial data, determines whether response is 
   * correct or not.
   *
   * @param  data {JsPsych.data}
   * @return {boolean}          
   */ 
  check_response(data) {

    // For debugging purposes:
    if (data.key_press == jsPsych.pluginAPI.convertKeyCharacterToKeyCode('q')){
      data.correct = -1;
      return -1; 
    }

    if ((data.right_correlation > data.left_correlation) 
          && data.key_press == jsPsych.pluginAPI.convertKeyCharacterToKeyCode('m') ||
          (data.left_correlation > data.right_correlation)
          && data.key_press == jsPsych.pluginAPI.convertKeyCharacterToKeyCode('z')){

      data.correct = true;
      return true;
    }
    // Assuming that if base_correlation = adjusted_correlation, at this point 
    // any user choice is wrong.
    else {
      data.correct = false;
      return false;
    }
  }

  /**
   * When called, will save individual trial data into a CSV.     
   */
  export_trial_data() {

    var trial_data = jsPsych.data.get().filter({type: 'jnd', run_type: 'test'})
                                       .filterCustom(function(x){ //Don't include the exit trials
                                         return x.correct != -1; 
                                       })
                                       // JND's trial variables
                                       .ignore('type')
                                       .ignore('run_type')
                                       .ignore('left_correlation')
                                       .ignore('right_correlation')
                                       // These are variables forced on by jsPsych
                                       .ignore('stimulus')
                                       .ignore('key_press')
                                       .ignore('choices')
                                       .ignore('trial_type')
                                       .ignore('trial_index')
                                       .ignore('time_elapsed')
                                       .ignore('internal_node_id');

    // TODO: js converting key_string to use double quotes, needs to be single to pass into ignore() fxn
    //
    // for (var key in jnd_exp.trial_variables){
    //  var key_string = '${key}';
    //  trial_data.ignore(key);
    // }

    var string = "S" + this.subject_id + "_" + this.condition_name + "_jnd_trial_results.csv";

    trial_data.localSave('csv', string);
  }

  /**
   * When called, will save aggregated trial data into a CSV.     
   */
  export_summary_data() {
    var csv = 'SUBJECT_ID,SUBJECT_INITIALS,PLOT,BASE,ABOVE,JND,TRIALS\n';

    var data = [];
    
    // Organize each row of the csv
    for (let i = 0; i<this.sub_conditions_constants.length; i++){
      var row = [this.subject_id, this.subject_initials, this.condition_name];
      var constants = this.sub_conditions_constants[i];
      var condition_data = jsPsych.data.get().filter({type: 'jnd', run_type: 'test', balanced_sub_condition: this.sub_condition_order[i]})
                                             .filterCustom(function(x){ //Don't include the exit trials
                                                return x.correct != -1; 
                                             })

      row.push(constants.base_correlation);
      row.push(constants.converge_from_above);
      row.push(condition_data.select('jnd').mean());
      row.push(condition_data.count());

      data.push(row);
    }

    // Append each row
    data.forEach(function(row){
      csv += row.join(',');
      csv += "\n";
    });

    var hiddenElement = document.createElement('a');
    hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
    hiddenElement.target = '_blank';
    hiddenElement.download = "S" + this.subject_id + "_" + this.condition_name + "_jnd_summary_results.csv";
    hiddenElement.click();
  }
}


// ingredient.js
// Ingredient model logic.

var neo4j = require('neo4j');
var errors = require('./errors');

var db = new neo4j.GraphDatabase({
    // Support specifying database info via environment variables,
    // but assume Neo4j installation defaults.
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
        'http://neo4j:neo4j.@neo4j:7474',
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Ingredient = module.exports = function Ingredient(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
    this._node = _node;
}

// Public constants:

Ingredient.VALIDATION_INFO = {
    'name': {
        required: true,
        minLength: 2,
        maxLength: 16,
        pattern: /^[A-Za-z0-9_]+$/,
        message: '2-16 characters; letters, numbers, and underscores only.'
    },
};

// Public instance properties:

// The ingredient's name, e.g. 'aseemk'.
Object.defineProperty(Ingredient.prototype, 'name', {
    get: function () { return this._node.properties['name']; }
});

// Private helpers:

// Takes the given caller-provided properties, selects only known ones,
// validates them, and returns the known subset.
// By default, only validates properties that are present.
// (This allows `Ingredient.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `Ingredient.create`.)
function validate(props, required) {
    var safeProps = {};

    for (var prop in Ingredient.VALIDATION_INFO) {
        var val = props[prop];
        validateProp(prop, val, required);
        safeProps[prop] = val;
    }

    return safeProps;
}

// Validates the given property based on the validation info above.
// By default, ignores null/undefined/empty values, but you can pass `true` for
// the `required` param to enforce that any required properties are present.
function validateProp(prop, val, required) {
    var info = Ingredient.VALIDATION_INFO[prop];
    var message = info.message;

    if (!val) {
        if (info.required && required) {
            throw new errors.ValidationError(
                'Missing ' + prop + ' (required).');
        } else {
            return;
        }
    }

    if (info.minLength && val.length < info.minLength) {
        throw new errors.ValidationError(
            'Invalid ' + prop + ' (too short). Requirements: ' + message);
    }

    if (info.maxLength && val.length > info.maxLength) {
        throw new errors.ValidationError(
            'Invalid ' + prop + ' (too long). Requirements: ' + message);
    }

    if (info.pattern && !info.pattern.test(val)) {
        throw new errors.ValidationError(
            'Invalid ' + prop + ' (format). Requirements: ' + message);
    }
}

function isConstraintViolation(err) {
    return err instanceof neo4j.ClientError &&
        err.neo4j.code === 'Neo.ClientError.Schema.ConstraintViolation';
}

// Public instance methods:

// Atomically updates this ingredient, both locally and remotely in the db, with the
// given property updates.
Ingredient.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (ingredient:Ingredient {name: {name}})',
        'SET ingredient += {props}',
        'RETURN ingredient',
    ].join('\n');

    var params = {
        name: this.name,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes name is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the name is taken or not.
            err = new errors.ValidationError(
                'The name ‘' + props.name + '’ is taken.');
        }
        if (err) return callback(err);

        if (!results.length) {
            err = new Error('Ingredient has been deleted! Ingredientname: ' + self.name);
            return callback(err);
        }

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['ingredient'];

        callback(null);
    });
};

Ingredient.prototype.del = function (callback) {
    // Use a Cypher query to delete both this ingredient and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    var query = [
        'MATCH (ingredient:Ingredient {name: {name}})',
        'OPTIONAL MATCH (ingredient) -[rel:follows]- (other)',
        'DELETE ingredient, rel',
    ].join('\n')

    var params = {
        name: this.name,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Ingredient.prototype.follow = function (other, callback) {
    var query = [
        'MATCH (ingredient:Ingredient {name: {thisIngredientname}})',
        'MATCH (other:Ingredient {name: {otherIngredientname}})',
        'MERGE (ingredient) -[rel:follows]-> (other)',
    ].join('\n')

    var params = {
        thisIngredientname: this.name,
        otherIngredientname: other.name,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Ingredient.prototype.unfollow = function (other, callback) {
    var query = [
        'MATCH (ingredient:Ingredient {name: {thisIngredientname}})',
        'MATCH (other:Ingredient {name: {otherIngredientname}})',
        'MATCH (ingredient) -[rel:follows]-> (other)',
        'DELETE rel',
    ].join('\n')

    var params = {
        thisIngredientname: this.name,
        otherIngredientname: other.name,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

// Calls callback w/ (err, following, others), where following is an array of
// ingredients this ingredient follows, and others is all other ingredients minus him/herself.
Ingredient.prototype.getFollowingAndOthers = function (callback) {
    // Query all ingredients and whether we follow each one or not:
    var query = [
        'MATCH (ingredient:Ingredient {name: {thisIngredientname}})',
        'MATCH (other:Ingredient)',
        'OPTIONAL MATCH (ingredient) -[rel:follows]-> (other)',
        'RETURN other, COUNT(rel)', // COUNT(rel) is a hack for 1 or 0
    ].join('\n')

    var params = {
        thisIngredientname: this.name,
    };

    var ingredient = this;
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) return callback(err);

        var following = [];
        var others = [];

        for (var i = 0; i < results.length; i++) {
            var other = new Ingredient(results[i]['other']);
            var follows = results[i]['COUNT(rel)'];

            if (ingredient.name === other.name) {
                continue;
            } else if (follows) {
                following.push(other);
            } else {
                others.push(other);
            }
        }

        callback(null, following, others);
    });
};

// Static methods:

Ingredient.get = function (name, callback) {
    var query = [
        'MATCH (ingredient:Ingredient {name: {name}})',
        'RETURN ingredient',
    ].join('\n')

    var params = {
        name: name,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) return callback(err);
        if (!results.length) {
            err = new Error('No such ingredient with name: ' + name);
            return callback(err);
        }
        var ingredient = new Ingredient(results[0]['ingredient']);
        callback(null, ingredient);
    });
};

Ingredient.getAll = function (callback) {
    var query = [
        'MATCH (ingredient:Ingredient)',
        'RETURN ingredient',
    ].join('\n');

    db.cypher({
        query: query,
    }, function (err, results) {
        if (err) return callback(err);
        var ingredients = results.map(function (result) {
            return new Ingredient(result['ingredient']);
        });
        callback(null, ingredients);
    });
};

// Creates the ingredient and persists (saves) it to the db, incl. indexing it:
Ingredient.create = function (props, callback) {
    var query = [
        'CREATE (ingredient:Ingredient {props})',
        'RETURN ingredient',
    ].join('\n');

    var params = {
        props: validate(props)
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes name is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the name is taken or not.
            err = new errors.ValidationError(
                'The name ‘' + props.name + '’ is taken.');
        }
        if (err) return callback(err);
        var ingredient = new Ingredient(results[0]['ingredient']);
        callback(null, ingredient);
    });
};

// Static initialization:

// Register our unique name constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'Ingredient',
    property: 'name',
}, function (err, constraint) {
    if (err) throw err;     // Failing fast for now, by crash the application.
    if (constraint) {
        console.log('(Registered unique names constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
})
